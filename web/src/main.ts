const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

const PALETTE_COLORS = [
  '#ff6b6b', '#ff8e8e', '#ffb3b3',
  '#ffa502', '#ffbe0b', '#ffd93d',
  '#2ed573', '#7bed9f', '#a8e6a3',
  '#1e90ff', '#54a0ff', '#89cff0',
  '#a55eea', '#c8a2f0', '#e0c8f7',
  '#ff6b9d', '#ff9fcc', '#ffcce0',
  '#888888', '#555555', '#222222',
];

// 作成フロー状態
let selectedColors: string[] = [];
let mixedImageData: ImageData | null = null;
let selectedShape: 'toge' | 'fuwa' | 'gunya' | null = null;
let currentCreateStep = 1;

// カレンダー状態
let currentCalDate = new Date();
let calCards: Map<string, any[]> = new Map(); // dateKey -> cards[]

// DOM要素
const paletteEl = document.getElementById('palette')!;
const canvas = document.getElementById('mixCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const canvasWrap = document.getElementById('canvasWrap')!;
const canvasHint = document.getElementById('canvasHint')!;
const shapeOptions = document.getElementById('shapeOptions')!;
const previewCard = document.getElementById('previewCard')!;
const toast = document.getElementById('toast')!;
const calendarGrid = document.getElementById('calendarGrid')!;
const calendarTitle = document.getElementById('calendarTitle')!;
const insightPanel = document.getElementById('insightPanel')!;
const insightList = document.getElementById('insightList')!;
const steps = ['step1', 'step2', 'step3', 'step4'];
const dots = document.querySelectorAll('.step-dot');
const navTabs = document.querySelectorAll('.nav-tab');
const viewPanels = document.querySelectorAll('.panel[id^="view-"]');

// 初期化
async function init() {
  renderPalette();
  setupCanvas();
  setupShapeOptions();
  setupCreateNavigation();
  setupViewNavigation();
  setupCalendarNavigation();
  await checkHealth();
  await loadCalendarMonth();
}

// ===== 共通 =====
function showToast(msg: string) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) console.log('API接続OK');
  } catch {
    console.warn('API未接続');
  }
}

// ===== ビュー切り替え =====
function setupViewNavigation() {
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = (tab as HTMLElement).dataset.view!;
      navTabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      viewPanels.forEach(p => p.classList.toggle('active', p.id === `view-${view}`));
      if (view === 'calendar') loadCalendarMonth();
    });
  });
}

// ===== 作成フロー =====
function renderPalette() {
  paletteEl.innerHTML = '';
  PALETTE_COLORS.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-btn';
    btn.style.background = color;
    btn.dataset.color = color;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('aria-label', `色 ${i + 1}`);
    btn.addEventListener('click', () => toggleColor(color, btn));
    paletteEl.appendChild(btn);
  });
}

function toggleColor(color: string, btn: HTMLButtonElement) {
  const isSelected = selectedColors.includes(color);
  if (isSelected) {
    selectedColors = selectedColors.filter(c => c !== color);
    btn.classList.remove('selected');
    btn.setAttribute('aria-selected', 'false');
  } else if (selectedColors.length < 3) {
    selectedColors.push(color);
    btn.classList.add('selected');
    btn.setAttribute('aria-selected', 'true');
  }
  updateStep1Button();
}

function updateStep1Button() {
  (document.getElementById('toStep2') as HTMLButtonElement).disabled = selectedColors.length < 2;
}

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 360 * dpr;
  canvas.height = 360 * dpr;
  canvas.style.width = '360px';
  canvas.style.height = '360px';
  ctx.scale(dpr, dpr);

  let isDrawing = false;
  let lastX = 0, lastY = 0;

  function getPos(e: MouseEvent | TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(e: MouseEvent | TouchEvent) {
    if (selectedColors.length === 0) return;
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x; lastY = pos.y;
    canvasHint.classList.add('hidden');
    canvasWrap.classList.add('ready');
    drawBrush(pos.x, pos.y, true);
    e.preventDefault();
  }

  function draw(e: MouseEvent | TouchEvent) {
    if (!isDrawing) return;
    const pos = getPos(e);
    drawBrush(pos.x, pos.y, false);
    lastX = pos.x; lastY = pos.y;
    e.preventDefault();
  }

  function endDraw() {
    isDrawing = false;
    mixedImageData = ctx.getImageData(0, 0, 360, 360);
    updateStep2Button();
  }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', endDraw);
}

function drawBrush(x: number, y: number, isStart: boolean) {
  const radius = 28;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const color = selectedColors[Math.floor(Math.random() * selectedColors.length)];
  gradient.addColorStop(0, color + 'CC');
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function updateStep2Button() {
  (document.getElementById('toStep3') as HTMLButtonElement).disabled = !mixedImageData;
}

function setupShapeOptions() {
  shapeOptions.querySelectorAll<HTMLButtonElement>('.shape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      shapeOptions.querySelectorAll<HTMLButtonElement>('.shape-btn').forEach(b => {
        b.classList.remove('selected');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-selected', 'true');
      selectedShape = btn.dataset.shape as 'toge' | 'fuwa' | 'gunya';
    });
  });
}

function setupCreateNavigation() {
  document.getElementById('toStep2')!.addEventListener('click', () => goCreateStep(2));
  document.getElementById('toStep3')!.addEventListener('click', () => { preparePreview(); goCreateStep(3); });
  document.getElementById('toStep4')!.addEventListener('click', () => { renderPreview(); goCreateStep(4); });
  document.getElementById('backTo1')!.addEventListener('click', () => goCreateStep(1));
  document.getElementById('backTo2')!.addEventListener('click', () => goCreateStep(2));
  document.getElementById('backTo3')!.addEventListener('click', () => goCreateStep(3));
  document.getElementById('saveCard')!.addEventListener('click', saveCard);
}

function goCreateStep(step: number) {
  currentCreateStep = step;
  steps.forEach((id, i) => {
    const el = document.getElementById(id)!;
    el.classList.toggle('active', i + 1 === step);
  });
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === step);
    dot.classList.toggle('done', i + 1 < step);
    dot.setAttribute('aria-selected', String(i + 1 === step));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function preparePreview() {
  if (!mixedImageData || !selectedShape) return;
}

function renderPreview() {
  if (!mixedImageData || !selectedShape) return;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 360; tempCanvas.height = 360;
  const tctx = tempCanvas.getContext('2d')!;
  tctx.putImageData(mixedImageData, 0, 0);
  const svg = generateCardSVG(tempCanvas, selectedShape!);
  previewCard.innerHTML = svg;
}

function generateCardSVG(sourceCanvas: HTMLCanvasElement, shape: 'toge' | 'fuwa' | 'gunya'): string {
  const size = 300;
  const padding = 20;
  const innerSize = size - padding * 2;
  const patternDataUrl = sourceCanvas.toDataURL('image/png');

  let shapePath = '';
  const cx = 150, cy = 150, r = innerSize / 2 - 4;

  switch (shape) {
    case 'toge': {
      const spikes = 12;
      const outerR = r;
      const innerR = r * 0.45;
      let path = '';
      for (let i = 0; i < spikes * 2; i++) {
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const radius = i % 2 === 0 ? outerR : innerR;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        path += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      path += 'Z';
      shapePath = `<path d="${path}" fill="url(#pattern)" stroke="#fff" stroke-width="2"/>`;
      break;
    }
    case 'fuwa':
      shapePath = `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pattern)" stroke="#fff" stroke-width="2"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="none" stroke="url(#pattern)" stroke-width="3" opacity="0.6"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="none" stroke="url(#pattern)" stroke-width="2" opacity="0.4"/>
      `;
      break;
    case 'gunya': {
      const wobble = 12;
      const points = 8;
      let gpath = `M${cx + r} ${cy}`;
      for (let i = 1; i <= points; i++) {
        const angle = (i * 2 * Math.PI) / 8;
        const nextAngle = ((i + 1) * 2 * Math.PI) / 8;
        const rx = r + (Math.random() - 0.5) * 12;
        const cx1 = cx + rx * Math.cos(angle);
        const cy1 = cy + rx * Math.sin(angle);
        const cx2 = cx + rx * Math.cos(nextAngle);
        const cy2 = cy + rx * Math.sin(nextAngle);
        const cpx = cx + (r * 0.5) * Math.cos(angle + Math.PI / 8);
        const cpy = cy + (r * 0.5) * Math.sin(nextAngle);
        gpath += ` Q${cpx.toFixed(1)} ${cpy.toFixed(1)} ${cx2.toFixed(1)} ${cy2.toFixed(1)}`;
      }
      gpath += 'Z';
      shapePath = `<path d="${gpath}" fill="url(#pattern)" stroke="#fff" stroke-width="2"/>`;
      break;
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
      <defs>
        <pattern id="pattern" patternUnits="userSpaceOnUse" width="360" height="360">
          <image href="${patternDataUrl}" x="0" y="0" width="360" height="360"/>
        </pattern>
      </defs>
      <rect width="300" height="300" fill="#fafafa"/>
      ${shapePath}
    </svg>
  `;
}

async function saveCard() {
  if (!mixedImageData || !selectedShape) return;
  const btn = document.getElementById('saveCard') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 360; tempCanvas.height = 360;
    const tctx = tempCanvas.getContext('2d')!;
    tctx.putImageData(mixedImageData, 0, 0);
    const svg = generateCardSVG(tempCanvas, selectedShape!);

    const res = await fetch(`${API_BASE}/api/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colors: selectedColors, shape: selectedShape, svg })
    });

    if (!res.ok) throw new Error('保存失敗');
    showToast('カードを保存しました！');
    setTimeout(() => resetCreateFlow(), 1500);
  } catch (e) {
    console.error(e);
    showToast('保存に失敗しました');
    btn.disabled = false;
    btn.textContent = '保存する ✨';
  }
}

function resetCreateFlow() {
  selectedColors = [];
  mixedImageData = null;
  selectedShape = null;
  paletteEl.querySelectorAll('.color-btn').forEach(b => {
    b.classList.remove('selected');
    b.setAttribute('aria-selected', 'false');
  });
  shapeOptions.querySelectorAll<HTMLButtonElement>('.shape-btn').forEach(b => {
    b.classList.remove('selected');
    b.setAttribute('aria-selected', 'false');
  });
  ctx.clearRect(0, 0, 360, 360);
  canvasHint.classList.remove('hidden');
  canvasWrap.classList.remove('ready');
  (document.getElementById('toStep2') as HTMLButtonElement).disabled = true;
  (document.getElementById('toStep3') as HTMLButtonElement).disabled = true;
  goCreateStep(1);
}

// ===== カレンダー機能 =====
function setupCalendarNavigation() {
  document.getElementById('prevMonth')!.addEventListener('click', () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    loadCalendarMonth();
  });
  document.getElementById('nextMonth')!.addEventListener('click', () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    loadCalendarMonth();
  });
}

async function loadCalendarMonth() {
  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();
  calendarTitle.textContent = `${year}年${month + 1}月`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const from = firstDay.toISOString().split('T')[0];
  const to = new Date(lastDay.getTime() + 86400000).toISOString().split('T')[0];

  try {
    const res = await fetch(`${API_BASE}/api/cards?from=${from}&to=${to}`);
    if (!res.ok) throw new Error('取得失敗');
    const cards = await res.json();

    // 日付ごとにグループ化
    calCards.clear();
    for (const card of cards) {
      const dateKey = card.created_at.split('T')[0];
      if (!calCards.has(dateKey)) calCards.set(dateKey, []);
      calCards.get(dateKey)!.push(card);
    }
  } catch (e) {
    console.error('カレンダー取得エラー:', e);
    calCards.clear();
  }
  renderCalendar();
  renderInsights();
}

function renderCalendar() {
  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay(); // 0=日
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];

  let html = '';

  // 前月の空白
  for (let i = 0; i < startDay; i++) {
    html += '<div class="cal-day empty-day"></div>';
  }

  // 今月の日付
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateKey = date.toISOString().split('T')[0];
    const dayCards = calCards.get(dateKey) || [];
    const isToday = dateKey === todayKey;
    const hasCards = dayCards.length > 0;

    let dayHtml = `<div class="cal-day${isToday ? ' today' : ''}${dayCards.length === 0 ? '' : ' has-card'}" data-date="${dateKey}" role="gridcell" tabindex="0">`;
    dayHtml += `<div class="cal-day-number">${d}</div>`;

    if (hasCards) {
      if (dayCards.length === 1) {
        const card = dayCards[0];
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 80; thumbCanvas.height = 80;
        const tctx = thumbCanvas.getContext('2d')!;
        // SVGを描画するため一時的にImageを使う
        dayHtml += `<div class="cal-card-thumb" data-svg="${escapeHtml(card.svg)}"></div>`;
      } else {
        dayHtml += `<div class="cal-card-thumb" data-multi="${dayCards.length}"></div>`;
        dayHtml += `<span class="cal-multi-indicator">${dayCards.length}</span>`;
      }
    }
    dayHtml += '</div>';
    html += dayHtml;
  }

  calendarGrid.innerHTML = html;

  // サムネイル描画（遅延）
  requestAnimationFrame(() => {
    calendarGrid.querySelectorAll<HTMLDivElement>('.cal-card-thumb[data-svg]').forEach(el => {
      const svg = el.dataset.svg!;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 80; c.height = 80;
        c.getContext('2d')!.drawImage(img, 0, 0, 80, 80);
        el.innerHTML = '';
        el.appendChild(c);
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svg);
    });
    calendarGrid.querySelectorAll<HTMLDivElement>('.cal-card-thumb[data-multi]').forEach(el => {
      const count = parseInt(el.dataset.multi || '0');
      el.style.background = 'linear-gradient(135deg, var(--accent-soft), var(--accent))';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'var(--accent)';
      el.style.fontWeight = '700';
      el.textContent = `×${count}`;
    });

    // クリックで詳細表示（将来拡張用）
    calendarGrid.querySelectorAll('.cal-day[data-date]').forEach(dayEl => {
      dayEl.addEventListener('click', () => {
        const dateKey = (dayEl as HTMLElement).dataset.date!;
        const cards = calCards.get(dateKey) || [];
        if (cards.length > 0) showDayDetail(dateKey, cards);
      });
    });
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" }[c]!));
}

function showDayDetail(dateKey: string, cards: any[]) {
  // 簡易モーダル的表示（将来拡張）
  const messages = cards.map((c, i) => `${i + 1}. ${c.shape} / ${JSON.parse(c.colors).join(', ')}`).join('\n');
  showToast(`${dateKey} のカード ${cards.length}枚`);
}

// パターン分析・インサイト
function renderInsights() {
  const insights: string[] = [];
  const dayEntries = Array.from(calCards.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (dayEntries.length === 0) {
    insightPanel.style.display = 'none';
    return;
  }

  // 曜日ごとの傾向
  const weekdayStats: Record<number, { toge: number; fuwa: number; gunya: number; colors: string[] }> = {};
  for (let i = 0; i < 7; i++) weekdayStats[i] = { toge: 0, fuwa: 0, gunya: 0, colors: [] };

  for (const [dateKey, cards] of dayEntries) {
    const dow = new Date(dateKey).getDay();
    for (const card of cards) {
      if (card.shape) weekdayStats[dow][card.shape as 'toge' | 'fuwa' | 'gunya']++;
      try {
        for (const c of JSON.parse(card.colors)) weekdayStats[dow].colors.push(c);
      } catch {}
    }
  }

  const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
  for (let i = 0; i < 7; i++) {
    const s = weekdayStats[i];
    const total = s.toge + s.fuwa + s.gunya;
    if (total === 0) continue;
    const dominant = Object.entries({ toge: s.toge, fuwa: s.fuwa, gunya: s.gunya }).sort((a, b) => b[1] - a[1])[0];
    const shapeLabel = { toge: 'トゲトゲ', fuwa: 'ふわふわ', gunya: 'ぐにゃぐにゃ' }[dominant[0]];
    if (dominant[1] >= 2) {
      insights.push(`${weekdayNames[i]}曜日は「${shapeLabel}」が多いね（${dominant[1]}回）`);
    }
    // 色の傾向
    if (s.colors.length >= 3) {
      const colorCounts: Record<string, number> = {};
      for (const c of s.colors) colorCounts[c] = (colorCounts[c] || 0) + 1;
      const topColor = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0];
      if (topColor[1] >= 2) {
        const colorName = getColorName(topColor[0]);
        insights.push(`${weekdayNames[i]}曜日は「${colorName}」がよく出るね`);
      }
    }
  }

  // 全体の傾向
  let allToge = 0, allFuwa = 0, allGunya = 0;
  for (const s of Object.values(weekdayStats)) {
    allToge += s.toge; allFuwa += s.fuwa; allGunya += s.gunya;
  }
  const allTotal = allToge + allFuwa + allGunya;
  if (allTotal > 0) {
    const dominantAll = Object.entries({ toge: allToge, fuwa: allFuwa, gunya: allGunya }).sort((a, b) => b[1] - a[1])[0];
    const label = { toge: 'トゲトゲ', fuwa: 'ふわふわ', gunya: 'ぐにゃぐにゃ' }[dominantAll[0]];
    insights.unshift(`今月は全体的に「${label}」な気持ちが多かったよ（${dominantAll[1]}/${allTotal}枚）`);
  }

  if (insights.length > 0) {
    insightPanel.style.display = 'block';
    insightList.innerHTML = insights.slice(0, 4).map(t => `<div class="insight-item">${t}</div>`).join('');
  } else {
    insightPanel.style.display = 'none';
  }
}

function getColorName(hex: string): string {
  const map: Record<string, string> = {
    '#ff6b6b': '赤', '#ff8e8e': '薄い赤', '#ffb3b3': 'ピンク寄りの赤',
    '#ffa502': 'オレンジ', '#ffbe0b': '黄橙', '#ffd93d': '黄色',
    '#2ed573': '緑', '#7bed9f': '薄い緑', '#a8e6a3': '淡い緑',
    '#1e90ff': '青', '#54a0ff': '水色', '#89cff0': '薄い青',
    '#a55eea': '紫', '#c8a2f0': '薄い紫', '#e0c8f7': 'ラベンダー',
    '#ff6b9d': 'ピンク', '#ff9fcc': '薄いピンク', '#ffcce0': '淡いピンク',
    '#888888': 'グレー', '#555555': '濃いグレー', '#222222': '黒',
  };
  return map[hex] || 'その色';
}

init();