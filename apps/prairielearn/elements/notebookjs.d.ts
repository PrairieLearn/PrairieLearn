/** Minimal type definitions for notebookjs */
interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw' | 'heading';
  source: string | string[];
  metadata?: Record<string, unknown>;
  outputs?: {
    output_type: string;
    data?: Record<string, unknown>;
    text?: string | string[];
    [key: string]: unknown;
  }[];
  execution_count?: number;
}

interface NotebookData {
  cells: NotebookCell[];
  metadata?: {
    kernelspec?: {
      display_name: string;
      language: string;
      name: string;
    };
    language_info?: {
      name: string;
      version: string;
      mimetype: string;
      file_extension: string;
      pygments_lexer: string;
      codemirror_mode: string | Record<string, unknown>;
      nbconvert_exporter: string;
    };
    [key: string]: unknown;
  };
  nbformat: number;
  nbformat_minor: number;
}

declare namespace nb {
  function parse(notebookJson: NotebookData): {
    render(): HTMLElement;
  };
}
