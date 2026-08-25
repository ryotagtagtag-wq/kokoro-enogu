import SignaturePad from 'signature_pad';

export type SketchPadController = {
  setColors(colors: string[]): void;
  open(): void;
  close(): void;
  /** 完了時に描画内容をPNG dataURLで返す（空ならnull） */
  take(): string | null;
};

/**
 * signature_pad による「自由におえかき」モーダル。
 * モーダルDOM(#sketchModal)とボタン類の配線もここで行う。
 */
export function createSketchPad(onComplete: (dataUrl: string | null) => void): SketchPadController {
  const modal = document.getElementById('sketchModal')!;
  const wrap = document.getElementById('sketchCanvasWrap')!;
  const canvasEl = document.getElementById('sketchCanvas') as HTMLCanvasElement;
  const colorBar = document.getElementById('sketchColors')!;
  const doneBtn = document.getElementById('sketchDone')!;
  const cancelBtn = document.getElementById('sketchCancel')!;
  const clearBtn = document.getElementById('sketchClear')!;

  let pad: SignaturePad | null = null;
  let colors: string[] = [];

  function resize(): void {
    if (!pad) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = wrap.clientWidth || 360;
    canvasEl.width = w * ratio;
    canvasEl.height = w * ratio;
    canvasEl.style.width = `${w}px`;
    canvasEl.style.height = `${w}px`;
    pad.clear(); // リサイズで座標がずれるためクリア
  }

  function renderColorBar(): void {
    const palette = colors.length > 0 ? colors : ['#888888'];
    colorBar.innerHTML = '';
    palette.forEach((c, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'sketch-color' + (i === 0 ? ' selected' : '');
      dot.style.background = c;
      dot.setAttribute('aria-label', `ペン色 ${c}`);
      dot.addEventListener('click', () => {
        colorBar.querySelectorAll('.sketch-color').forEach((d) => d.classList.remove('selected'));
        dot.classList.add('selected');
        if (pad) pad.penColor = c;
      });
      colorBar.appendChild(dot);
    });
  }

  function ensurePad(): SignaturePad {
    if (pad) return pad;
    pad = new SignaturePad(canvasEl, {
      backgroundColor: 'rgba(0,0,0,0)',
      penColor: colors[0] ?? '#888888',
      minWidth: 3,
      maxWidth: 9,
      velocityFilterWeight: 0.75,
      throttle: 8,
    });
    return pad;
  }

  window.addEventListener('resize', resize);

  doneBtn.addEventListener('click', () => {
    const data = pad && !pad.isEmpty() ? pad.toDataURL('image/png') : null;
    modal.classList.remove('open');
    if (pad) pad.clear();
    onComplete(data);
  });
  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('open');
    if (pad) pad.clear();
  });
  clearBtn.addEventListener('click', () => pad?.clear());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      if (pad) pad.clear();
    }
  });

  return {
    setColors(next: string[]) {
      colors = next;
      renderColorBar();
    },
    open() {
      modal.classList.add('open');
      // 表示後にリサイズ（clientWidth を取るため）
      requestAnimationFrame(() => {
        resize();
        const p = ensurePad();
        p.penColor = colors[0] ?? '#888888';
        renderColorBar();
      });
    },
    close() {
      modal.classList.remove('open');
      if (pad) pad.clear();
    },
    take() {
      if (!pad || pad.isEmpty()) return null;
      return pad.toDataURL('image/png');
    },
  };
}
