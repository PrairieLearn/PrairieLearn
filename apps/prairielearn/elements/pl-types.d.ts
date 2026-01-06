// Import existing type definition files
import './notebookjs.d.ts';
import './panzoom.d.ts';

import type { DOMPurify } from 'dompurify';
import type { TomSelect } from 'tom-select';

/** Global declarations for external libraries */
declare global {
  const DOMPurify: DOMPurify;
  const TomSelect: TomSelect;
  /** jQuery plugin extensions - using @types/jquery for base types */
  interface JQuery {
    modal(action?: string): JQuery;
    popover(options?: Bootstrap.PopoverOptions): JQuery;
  }

  interface Window {
    TomSelect: typeof TomSelect;
    PLMultipleChoice: (uuid: string) => void;
    PLOrderBlocks: (uuid: string, options: PLOrderBlocksOptions) => void;
    PLFileEditor: new (uuid: string, options: PLFileEditorOptions) => PLFileEditor;
    PLImageCapture: {
      enhanceImage: (uuid: string, originalDataURL: string) => Promise<string>;
    };
  }
}
