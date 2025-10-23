// Type definitions for PrairieLearn element options

// Import existing type definition files
import './notebookjs.d.ts';
import './panzoom.d.ts';
import './socket-io.d.ts';
import './tom-select.d.ts';
import './window-extensions.d.ts';

/** Global declarations for external libraries */
declare global {
  /** Global variables - using proper type definitions */
  const DOMPurify: {
    sanitize(dirty: string, config?: { SANITIZE_NAMED_PROPS?: boolean }): string;
  };
  const mechanicsObjects: {
    addCanvasBackground(canvas: any, width: number, height: number, gridSize: number): void;
  };
  const fabric: {
    Canvas: new (element: HTMLElement) => any;
    StaticCanvas: new (element: HTMLElement) => any;
    Object: any;
    util: {
      addListener(element: HTMLElement, event: string, handler: (e: Event) => void): void;
    };
  };
  const bootstrap: {
    Popover: {
      getInstance(element: HTMLElement): { hide(): void } | null;
    };
    Toast: new (
      element: HTMLElement,
      options?: { autohide?: boolean; delay?: number },
    ) => { show(): void };
  };
  const he: {
    encode(
      text: string,
      options?: { allowUnsafeSymbols?: boolean; useNamedReferences?: boolean },
    ): string;
  };
  const nb: {
    markdown: (text: string) => string;
    sanitizer: (code: string) => string;
    parse: (data: any) => { render(): HTMLElement };
  };
  const Panzoom: (
    element: HTMLElement,
    options?: any,
  ) => {
    zoomIn(opts?: any): void;
    zoomOut(opts?: any): void;
    zoom(scale: number, opts?: any): void;
    getScale(): number;
    reset(options?: { animate?: boolean }): void;
  };

  interface Window {
    PLFileEditor: typeof PLFileEditor;
    PLOrderBlocks: typeof PLOrderBlocks;
    TomSelect: typeof TomSelect;
    PLDrawingApi: {
      generateID(): string;
      _idCounter: number;
      elements: any;
      elementModule: any;
      createElement: any;
      clientFilesBase: string;
    };
  }

  /** Global function constructors - using imported types */
  function PLFileEditor(uuid: string, options: PLFileEditorOptions): void;

  function PLOrderBlocks(uuid: string, options: PLOrderBlocksOptions): void;

  function TomSelect(element: HTMLElement, options?: TomSelectOptions): TomSelect;
}
