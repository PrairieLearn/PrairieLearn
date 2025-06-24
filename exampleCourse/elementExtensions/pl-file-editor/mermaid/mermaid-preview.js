window.PLFileEditor.prototype.preview.mermaid = (() => {
  let mermaidPromise = null;
  return async (input) => {
    if (mermaidPromise == null) {
      mermaidPromise = new Promise((resolve) => {
        import('mermaid').then(({ default: mermaid }) => {
          mermaid.initialize({
            startOnLoad: false,
            // https://github.com/mermaid-js/mermaid-cli/issues/112#issuecomment-2855513722
            htmlLabels: false,
            flowchart: { useMaxWidth: false, htmlLabels: false },
          });
          resolve(mermaid);
        });
      });
    }
    const mermaid = await mermaidPromise;
    return await mermaid.render('mermaid-preview', input).then(
      ({ svg }) => svg,
      (error) => `<div class="text-danger">${error.message}</div>`,
    );
  };
})();
