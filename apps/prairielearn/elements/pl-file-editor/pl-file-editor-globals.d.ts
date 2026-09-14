import type * as AceBuilds from 'ace-builds';
import type * as ThemeList from 'ace-builds/src-noconflict/ext-themelist';
import type { DOMPurify as DOMPurifyInstance } from 'dompurify';

// Browser globals supplied by the element's runtime dependencies.
declare global {
  interface Window {
    PLFileEditor: {
      new (uuid: string, options: FileEditorOptions): FileEditor;
      prototype: FileEditor;
    };
  }

  const ace: Omit<typeof AceBuilds, 'require'> & {
    require(modules: ['ace/ext/themelist'], callback: (themeList: typeof ThemeList) => void): void;
  };
  const DOMPurify: DOMPurifyInstance;
  const MathJax: {
    startup: { promise: Promise<void> };
    whenReady(callback: () => void): Promise<void>;
    typesetClear(elements: Element[]): void;
    typesetPromise(elements: Element[]): Promise<void>;
    svgStylesheet(): HTMLStyleElement | null;
  };
}

// Ace accepts null to reset these options, but its bundled declarations omit it.
declare module 'ace-builds-internal/editor' {
  interface Editor {
    setTheme(theme: string | AceBuilds.Ace.Theme | null, callback?: () => void): void;
    setFontSize(size: string | number | null): void;
  }
}
