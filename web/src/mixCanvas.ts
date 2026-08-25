import { Canvas, PencilBrush, Image as FabricImage } from 'fabric';

export type MixCanvasController = {
  /** 選択中の色を渡す（ストロークごとに順番に使い「まぜていく」） */
  setColors(colors: string[]): void;
  /** ストロークが追加されるたびに呼ばれる */
  onStroke(cb: () => void): void;
  undo(): void;
  clear(): void;
  isEmpty(): boolean;
  /** PNG dataURL をキャンバスへ貼り付け（おえかき合成用） */
  addImageFromUrl(dataUrl: string): Promise<void>;
  /** generateCardSVG に渡す実キャンバス */
  sourceCanvas(): HTMLCanvasElement;
};

/**
 * fabric.js で #mixCanvas をラップする。
 * ストロークごとに選択色を順繰り替えることで、重なりで「混ざった」見た目を作る。
 */
export function createMixCanvas(el: HTMLCanvasElement): MixCanvasController {
  const fabricCanvas = new Canvas(el, {
    isDrawingMode: true,
    selection: false,
    enableRetinaScaling: true,
  });
  fabricCanvas.setDimensions({ width: 360, height: 360 });

  const brush = new PencilBrush(fabricCanvas);
  brush.width = 16;
  brush.strokeLineCap = 'round';
  brush.strokeLineJoin = 'round';
  fabricCanvas.freeDrawingBrush = brush;

  let colors: string[] = [];
  let colorIndex = 0;

  fabricCanvas.on('mouse:down', () => {
    if (colors.length > 0) {
      brush.color = colors[colorIndex % colors.length];
      colorIndex++;
    }
  });

  return {
    setColors(next: string[]) {
      // 選択色が変わったら順番をリセット
      if (next.join() !== colors.join()) colorIndex = 0;
      colors = next;
      if (colors.length > 0 && !brush.color) brush.color = colors[0];
    },
    onStroke(cb: () => void) {
      fabricCanvas.on('path:created', () => cb());
    },
    undo() {
      const objs = fabricCanvas.getObjects();
      if (objs.length > 0) fabricCanvas.remove(objs[objs.length - 1]);
      fabricCanvas.requestRenderAll();
    },
    clear() {
      fabricCanvas.getObjects().slice().forEach((o) => fabricCanvas.remove(o));
      fabricCanvas.requestRenderAll();
    },
    isEmpty() {
      return fabricCanvas.getObjects().length === 0;
    },
    addImageFromUrl(dataUrl: string) {
      return FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
        img.scaleToWidth(360);
        img.set({ left: 0, top: 0 });
        fabricCanvas.add(img);
        fabricCanvas.requestRenderAll();
      });
    },
    sourceCanvas() {
      return fabricCanvas.lowerCanvasEl as HTMLCanvasElement;
    },
  };
}
