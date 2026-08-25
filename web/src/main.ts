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
let calCards: Map<string, any[]> = new Map();

// 設定状態
let settings: {
  sos_enabled: boolean;
  ai_reflection_enabled: boolean;
  child_nickname: string;
  parent_passcode_hash: string;
} = {
  sos_enabled: false,
  ai_reflection_enabled: false,
  child_nickname: '',
  parent_passcode_hash: '',
};

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
const reflectionCard = document.getElementById('reflectionCard')!;
const reflectionText = document.getElementById('reflectionText')!;
const steps = ['step1', 'step2', 'step3', 'step4'];
const dots = document.querySelectorAll('.step-dot');
const navTabs = document.querySelectorAll('.nav-tab');
const viewPanels = document.querySelectorAll('.panel[id^="view-"]');
const sosAlert = document.getElementById('sosAlert')!;
const sosAlertText = document.getElementById('sosAlertText')!;
const sosAlertClose = document.getElementById('sosAlertClose')!;
const sosToggle = document.getElementById('sosToggle')!;
const aiToggle = document.getElementById('aiToggle')!;
const childNicknameInput = document.getElementById('childNickname') as HTMLInputElement;
const parentPasscodeInput = document.getElementById('parentPasscode') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettings')!;

// 初期化
async function init() {
  renderPalette();
  setupCanvas();
  setupShapeOptions();
  setupCreateNavigation();
  setupViewNavigation();
  setupCalendarNavigation();
  setupSettings();
  await checkHealth();
  await loadSettings();
  await loadCalendarMonth();
  await loadReflection();
  startSosPolling();
  checkParentDashboardMode();
}

init();

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
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];

  let html = '';

  for (let i = 0; i < startDay; i++) {
    html += '<div class="cal-day empty-day"></div>';
  }

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
  const map: Record<string, string> = { '&': '&', '<': '<', '>': '>', '"': '"', "'": "\'" };
  return text.replace(/[&<>"']/g, c => map[c]!);
}

function showDayDetail(dateKey: string, cards: any[]) {
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

// ===== 設定機能 =====
async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    if (!res.ok) throw new Error('設定取得失敗');
    const data = await res.json();
    settings.sos_enabled = data.sos_enabled === 'true';
    settings.ai_reflection_enabled = data.ai_reflection_enabled === 'true';
    settings.child_nickname = data.child_nickname || '';
    settings.parent_passcode_hash = data.parent_passcode_hash || '';
    applySettingsToUI();
  } catch (e) {
    console.error('設定読み込みエラー:', e);
  }
}

function applySettingsToUI() {
  sosToggle.classList.toggle('active', settings.sos_enabled);
  sosToggle.setAttribute('aria-checked', String(settings.sos_enabled));
  aiToggle.classList.toggle('active', settings.ai_reflection_enabled);
  aiToggle.setAttribute('aria-checked', String(settings.ai_reflection_enabled));
  childNicknameInput.value = settings.child_nickname;
  parentPasscodeInput.value = '';
}

function setupSettings() {
  sosToggle.addEventListener('click', () => {
    settings.sos_enabled = !settings.sos_enabled;
    sosToggle.classList.toggle('active', settings.sos_enabled);
    sosToggle.setAttribute('aria-checked', String(settings.sos_enabled));
  });
  sosToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sosToggle.click();
    }
  });

  aiToggle.addEventListener('click', () => {
    settings.ai_reflection_enabled = !settings.ai_reflection_enabled;
    aiToggle.classList.toggle('active', settings.ai_reflection_enabled);
    aiToggle.setAttribute('aria-checked', String(settings.ai_reflection_enabled));
  });
  aiToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      aiToggle.click();
    }
  });

  childNicknameInput.addEventListener('input', () => {
    settings.child_nickname = childNicknameInput.value;
  });

  parentPasscodeInput.addEventListener('input', () => {
    // パスコードは保存時にハッシュ化
  });

  saveSettingsBtn.addEventListener('click', saveSettings);
}

async function saveSettings() {
  const passcode = parentPasscodeInput.value.trim();
  const body: Record<string, string> = {
    sos_enabled: settings.sos_enabled ? 'true' : 'false',
    ai_reflection_enabled: settings.ai_reflection_enabled ? 'true' : 'false',
    child_nickname: settings.child_nickname,
  };
  if (passcode) {
    const hash = await sha256Hex(passcode);
    body.parent_passcode_hash = hash;
  }
  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('保存失敗');
    settings.parent_passcode_hash = body.parent_passcode_hash || settings.parent_passcode_hash;
    showToast('設定を保存しました');
  } catch (e) {
    console.error(e);
    showToast('設定の保存に失敗しました');
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== SOS検知・アラート =====
let sosAlertShown = false;

async function checkSos() {
  if (!settings.sos_enabled) return;
  try {
    const res = await fetch(`${API_BASE}/api/sos`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.sos && !sosAlertShown) {
      showSosAlert();
    }
  } catch (e) {
    console.error('SOSチェックエラー:', e);
  }
}

function showSosAlert() {
  sosAlertShown = true;
  const nickname = settings.child_nickname || 'お子さん';
  sosAlertText.textContent = `${nickname}が最近モヤモヤしているみたいです（内容は秘密）。\n「最近どう？」と声をかけてあげてください。`;
  sosAlert.classList.add('show');
}

sosAlertClose.addEventListener('click', () => {
  sosAlert.classList.remove('show');
});

function startSosPolling() {
  checkSos();
  setInterval(checkSos, 60 * 60 * 1000); // 1時間ごと
}

// ===== AIリフレクション =====
async function loadReflection() {
  if (!settings.ai_reflection_enabled) {
    reflectionCard.style.display = 'none';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/reflection`, { method: 'POST' });
    if (!res.ok) {
      reflectionCard.style.display = 'none';
      return;
    }
    const data = await res.json();
    if (data.message) {
      reflectionText.textContent = data.message;
      reflectionCard.style.display = 'block';
    } else {
      reflectionCard.style.display = 'none';
    }
  } catch (e) {
    console.error('リフレクション取得エラー:', e);
    reflectionCard.style.display = 'none';
  }
}

// ===== 保護者ダッシュボードモード =====
function checkParentDashboardMode() {
  const params = new URLSearchParams(window.location.search);
  const passcode = params.get('passcode');
  if (passcode) {
    document.body.classList.add('parent-mode');
    (navTabs as NodeListOf<HTMLElement>).forEach(t => { t.style.display = 'none'; });
    (viewPanels as NodeListOf<HTMLElement>).forEach(p => p.classList.remove('active'));
    document.getElementById('view-create')!.classList.add('hidden');
    document.getElementById('view-calendar')!.classList.add('hidden');
    document.getElementById('view-settings')!.classList.add('hidden');
    renderParentDashboard(passcode);
  }
}

async function renderParentDashboard(passcode: string) {
  try {
    const res = await fetch(`${API_BASE}/api/parent/summary?passcode=${encodeURIComponent(passcode)}`);
    if (!res.ok) {
      showToast('パスコードが違います');
      setTimeout(() => window.history.replaceState({}, '', '/'), 2000);
      return;
    }
    const data = await res.json();

    const main = document.querySelector('main')!;
    main.innerHTML = `
      <section class="panel active parent-dashboard">
        <div class="parent-header">
          <h2>${data.nickname || 'お子さん'}のココロの絵の具</h2>
          <p>保護者ダッシュボード</p>
        </div>

        <div class="parent-card">
          <h3>SOSステータス</h3>
          <div class="sos-status ${data.sos ? 'sos-active' : ''}">
            <div class="sos-icon">${data.sos ? '💛' : '✨'}</div>
            <div class="sos-info">
              <h4>${data.sos ? 'SOS発信中' : '落ち着いています'}</h4>
              <p>${data.sos ? data.message : '最近は落ち着いて過ごせています'}</p>
            </div>
          </div>
        </div>

        <div class="parent-card">
          <h3>最近のカード（直近31日）</h3>
          <div class="card-list" id="parentCardList"></div>
        </div>
      </section>
    `;

    const cardList = document.getElementById('parentCardList')!;
    if (data.cards && data.cards.length > 0) {
      cardList.innerHTML = data.cards.map((card: any) => {
        const colors = JSON.parse(card.colors);
        const date = new Date(card.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });
        const shapeLabel = ({ toge: 'トゲトゲ', fuwa: 'ふわふわ', gunya: 'ぐにゃぐにゃ' } as Record<string, string>)[card.shape] || card.shape;
        return `
          <div class="parent-card-item">
            <div class="parent-card-thumb" data-svg="${escapeHtml(card.svg)}"></div>
            <div class="parent-card-info">
              <div class="parent-card-date">${date}</div>
              <div class="parent-card-shape">${shapeLabel}</div>
              <div class="parent-card-colors">
                ${colors.map((c: string) => `<span class="parent-color-dot" style="background:${c}"></span>`).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      cardList.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">まだカードがありません</p>';
    }

    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLDivElement>('.parent-card-thumb[data-svg]').forEach(el => {
        const svg = el.dataset.svg!;
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = 56; c.height = 56;
          c.getContext('2d')!.drawImage(img, 0, 0, 56, 56);
          el.innerHTML = '';
          el.appendChild(c);
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(svg);
      });
    });
  } catch (e) {
    console.error('保護者ダッシュボードエラー:', e);
    showToast('ダッシュボードの読み込みに失敗しました');
  }
}