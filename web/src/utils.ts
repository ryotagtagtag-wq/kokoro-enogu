/** ローカルタイムゾーンの日付キー (YYYY-MM-DD) */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** SVG文字列を安全なdata URIへ（btoaは非Latin1で例外を出すためencodeURIComponent方式） */
export function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * root内の [data-card-id] 要素に、svgMapから取り出したSVGをサムネイル描画する。
 * SVGをHTML属性に直接埋め込まないことでエスケープ問題を根絶する。
 */
export function renderThumbs(
  root: ParentNode,
  svgMap: Map<number, string>,
  size = 80
): void {
  root.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
    const id = Number(el.dataset.cardId);
    const svg = svgMap.get(id);
    if (!svg) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, size, size);
      el.innerHTML = '';
      el.appendChild(c);
    };
    img.src = svgToDataUri(svg);
  });
}
