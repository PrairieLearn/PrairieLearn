// Import existing type definition files
import './notebookjs.d.ts';
import './panzoom.d.ts';
import './socket-io.d.ts';
import './window-extensions.d.ts';

import type { DOMPurify } from 'dompurify';
import type { TomSelect } from 'tom-select';

/**
 * Options for PLFileEditor
 */
interface PLFileEditorOptions {
  originalContents?: string;
  preview?: Record<string, (content: string) => string | Promise<string>>;
  preview_type?: string;
  readOnly?: boolean;
  aceMode?: string;
  aceTheme?: string;
  fontSize?: number;
  minLines?: number;
  maxLines?: number;
  autoResize?: boolean;
  plOptionFocus?: boolean;
  currentContents?: string;
}

/**
 * Options for PLOrderBlocks
 */
interface PLOrderBlocksOptions {
  maxIndent: number;
  enableIndentation: boolean;
  inline?: boolean;
}

/** Global declarations for external libraries */
declare global {
  const DOMPurify: DOMPurify;
  const TomSelect: TomSelect;
  /** jQuery plugin extensions */
  interface JQuery {
    modal(action?: string): JQuery;
    popover(options?: any): JQuery;
  }

  const mechanicsObjects: {
    addCanvasBackground(canvas: any, width: number, height: number, gridSize: number): void;
  };

  interface Window {
    PLFileEditor: typeof PLFileEditor;
    PLOrderBlocks: typeof PLOrderBlocks;
    TomSelect: typeof TomSelect;
    PLDrawingApi: {
      generateID(): number;
      _idCounter: number;
      elements: any;
      elementModule: any;
      createElement: any;
      clientFilesBase: string;
      registerElements: (module: string, elements: any) => void;
      getElement: (type: string) => any;
      restoreAnswer: (canvas: any, submittedAnswer: any) => void;
      setupCanvas: (canvas: any, options: any) => void;
    };
  }

  /** Global function constructors - using imported types */
  function PLFileEditor(uuid: string, options: PLFileEditorOptions): void;

  function PLOrderBlocks(uuid: string, options: PLOrderBlocksOptions): void;
}
