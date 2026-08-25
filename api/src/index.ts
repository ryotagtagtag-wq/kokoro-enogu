import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

type Bindings = {
  DB: D1Database;
  AI: Ai;
  ALLOWED_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '/api/*',
  (c, next) =>
    cors({
      origin: c.env.ALLOWED_ORIGIN ?? '*',
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })(c, next)
);

app.get('/api/health', (c) => c.json({ ok: true }));

// ---- カード ----

app.post('/api/cards', async (c) => {
  const body = await c.req.json<{ colors?: string[]; shape?: string; svg?: string }>();
  if (!Array.isArray(body.colors) || body.colors.length === 0 || !body.svg) {
    return c.json({ error: 'invalid' }, 400);
  }
  await c.env.DB.prepare('INSERT INTO cards (colors, shape, svg) VALUES (?, ?, ?)')
    .bind(JSON.stringify(body.colors), body.shape ?? null, body.svg)
    .run();
  return c.json({ ok: true }, 201);
});

app.get('/api/cards', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  let sql = 'SELECT id, created_at, colors, shape, svg FROM cards';
  const conds: string[] = [];
  const binds: (string | number)[] = [];
  if (from) {
    conds.push('created_at >= ?');
    binds.push(from);
  }
  if (to) {
    conds.push('created_at <= ?');
    binds.push(to);
  }
  if (conds.length > 0) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return c.json(results);
});

// ---- 設定 ----

app.get('/api/settings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all<{
    key: string;
    value: string;
  }>();
  return c.json(Object.fromEntries(results.map((r) => [r.key, r.value])));
});

app.put('/api/settings', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  for (const [key, value] of Object.entries(body)) {
    await c.env.DB.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
      .bind(key, String(value))
      .run();
  }
  return c.json({ ok: true });
});

// ---- SOS（言葉にしないSOS）----

/** グレー/黒のみの暗いカードか判定 */
function isDarkCard(colorsJson: string, shape: string | null): boolean {
  let colors: string[];
  try {
    colors = JSON.parse(colorsJson);
  } catch {
    return false;
  }
  if (!Array.isArray(colors) || colors.length === 0) return false;
  const dark = colors.every((hex) => {
    const m = String(hex).replace('#', '');
    if (m.length !== 6) return false;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // 黒っぽい or 無彩色に近いグレー
    return max < 90 || (max - min < 24 && max < 140);
  });
  return dark && shape === 'toge';
}

app.get('/api/sos', async (c) => {
  const enabledRow = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'sos_enabled'"
  ).first<{ value: string }>();
  if (enabledRow?.value !== 'true') return c.json({ sos: false, enabled: false });

  const { results } = await c.env.DB.prepare(
    'SELECT colors, shape FROM cards ORDER BY created_at DESC LIMIT 3'
  ).all<{ colors: string; shape: string | null }>();
  const sos =
    results.length === 3 && results.every((r) => isDarkCard(r.colors, r.shape));
  return c.json({ sos, enabled: true });
});

// ---- 保護者ダッシュボード（URL + パスコード）----

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

app.get('/api/parent/summary', async (c) => {
  const passcode = c.req.query('passcode') ?? '';
  const hashRow = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'parent_passcode_hash'"
  ).first<{ value: string }>();
  if (!hashRow || (await sha256Hex(passcode)) !== hashRow.value) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const nickname =
    (
      await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'child_nickname'").first<{
        value: string;
      }>()
    )?.value ?? '';

  const { results: cards } = await c.env.DB.prepare(
    'SELECT id, created_at, colors, shape, svg FROM cards ORDER BY created_at DESC LIMIT 31'
  ).all<{ id: number; created_at: string; colors: string; shape: string | null; svg: string }>();

  const sos =
    cards.length >= 3 &&
    cards
      .slice(0, 3)
      .every((r) => isDarkCard(r.colors, r.shape));

  return c.json({
    nickname,
    sos,
    message: sos ? `${nickname || 'お子さん'}が最近モヤモヤしているみたいです（内容は秘密）` : null,
    cards: cards.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      colors: JSON.parse(r.colors),
      shape: r.shape,
      svg: r.svg,
    })),
  });
});

// ---- AI週末リフレクション（Workers AI / ON・OFF可）----

async function isAiEnabled(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = 'ai_reflection_enabled'")
    .first<{ value: string }>();
  return row?.value === 'true';
}

/** 直近7日分のカードからAIへの要約文を作る（カードがなければ null） */
async function getWeekSummary(db: D1Database): Promise<string | null> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { results } = await db
    .prepare(
      'SELECT colors, shape, created_at FROM cards WHERE created_at >= ? ORDER BY created_at'
    )
    .bind(weekAgo)
    .all<{ colors: string; shape: string | null; created_at: string }>();
  if (results.length === 0) return null;

  // 簡易サマリ: 形の集計と色の明るさ傾向
  const shapes = { toge: 0, fuwa: 0, gunya: 0 } as Record<string, number>;
  let bright = 0;
  let total = 0;
  for (const r of results) {
    if (r.shape && r.shape in shapes) shapes[r.shape]++;
    try {
      for (const hex of JSON.parse(r.colors) as string[]) {
        const m = String(hex).replace('#', '');
        if (m.length !== 6) continue;
        bright +=
          (parseInt(m.slice(0, 2), 16) + parseInt(m.slice(2, 4), 16) + parseInt(m.slice(4, 6), 16)) /
          3;
        total++;
      }
    } catch {
      /* skip */
    }
  }
  const avgBright = total > 0 ? Math.round(bright / total) : 128;
  return `今週${results.length}枚。形: トゲトゲ${shapes.toge}/ふわふわ${shapes.fuwa}/ぐにゃぐにゃ${shapes.gunya}。色の平均明るさ: ${avgBright}/255。`;
}

function reflectionMessages(summary: string) {
  return [
    {
      role: 'system' as const,
      content:
        'あなたは小学生にやさしく寄り添う存在です。50字以内で、決めつけず断定せず、肯定的な一言を返します。質問はしないでください。',
    },
    {
      role: 'user' as const,
      content: `子どもが1週間、気持ちを色と形のカードで記録しました。\n${summary}\nこれに対してやさしい一言をください。`,
    },
  ];
}

app.post('/api/reflection', async (c) => {
  if (!(await isAiEnabled(c.env.DB))) return c.json({ error: 'disabled' }, 400);
  const summary = await getWeekSummary(c.env.DB);
  if (!summary) return c.json({ message: null });

  const res = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: reflectionMessages(summary),
  });
  const message = (res as { response?: string }).response ?? null;
  return c.json({ message });
});

// ストリーミング版（Vercel AI SDK + workers-ai-provider、zodで入力検証）
const reflectionRequestSchema = z.object({
  nickname: z.string().max(20).optional(),
});

app.post('/api/reflection/stream', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = reflectionRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid' }, 400);

  if (!(await isAiEnabled(c.env.DB))) return c.json({ error: 'disabled' }, 400);
  const summary = await getWeekSummary(c.env.DB);
  if (!summary) return c.json({ message: null });

  const workersai = createWorkersAI({ binding: c.env.AI });
  const result = streamText({
    model: workersai('@cf/meta/llama-3.1-8b-instruct'),
    messages: reflectionMessages(summary),
    maxOutputTokens: 120,
  });
  return result.toTextStreamResponse();
});

export default app;
