/** Minimal type definitions for Panzoom */
interface PanzoomOptions {
  cursor?: string;
  disablePan?: boolean;
  disableZoom?: boolean;
  disableXAxis?: boolean;
  disableYAxis?: boolean;
  exclude?: string;
  excludeClass?: string;
  force?: boolean;
  maxScale?: number;
  minScale?: number;
  panOnlyZoomed?: boolean;
  relativeTo?: 'viewport' | 'parent';
  setTransform?: (elem: HTMLElement, transform: string) => void;
  startScale?: number;
  startX?: number;
  startY?: number;
  step?: number;
  touchAction?: string;
  contain?: 'inside' | 'outside';
  focal?: { x: number; y: number };
  duration?: number;
  easing?: string;
  animate?: boolean;
}

interface PanzoomInstance {
  zoomIn(opts?: { step?: number; animate?: boolean; duration?: number; easing?: string }): void;
  zoomOut(opts?: { step?: number; animate?: boolean; duration?: number; easing?: string }): void;
  zoom(
    scale: number,
    opts?: {
      animate?: boolean;
      duration?: number;
      easing?: string;
      focal?: { x: number; y: number };
    },
  ): void;
  getScale(): number;
  getOptions(): PanzoomOptions;
  getPan(): { x: number; y: number };
  getZoom(): { x: number; y: number };
  pan(x: number, y: number, opts?: { animate?: boolean; duration?: number; easing?: string }): void;
  reset(opts?: { animate?: boolean; duration?: number; easing?: string }): void;
  setOptions(options: Partial<PanzoomOptions>): void;
  setStyle(property: string, value: string): void;
  toggleZoom(opts?: { animate?: boolean; duration?: number; easing?: string }): void;
}

declare function Panzoom(element: HTMLElement, options?: PanzoomOptions): PanzoomInstance;
