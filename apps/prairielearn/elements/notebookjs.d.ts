// Minimal type definitions for notebookjs
declare namespace nb {
  function parse(notebookJson: any): {
    render(): HTMLElement;
  };
}

