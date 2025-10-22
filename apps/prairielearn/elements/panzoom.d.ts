// Minimal type definitions for Panzoom
declare function Panzoom(element: HTMLElement, options?: any): {
  zoomIn(opts?: any): void;
  zoomOut(opts?: any): void;
  zoom(scale: number, opts?: any): void;
  getScale(): number;
};

