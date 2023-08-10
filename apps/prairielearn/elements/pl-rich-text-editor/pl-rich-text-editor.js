/* eslint-env browser,jquery */
/* global Quill, he, MathJax, QuillMarkdown, showdown, DOMPurify */

(() => {
  const rtePurify = DOMPurify();
  const rtePurifyConfig = { SANITIZE_NAMED_PROPS: true };

  rtePurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'span' && node.classList.contains('ql-formula')) {
      // Quill formulas don't need their SVG content in the sanitized version,
      // as they are re-rendered upon loading.
      node.innerText = `$${node.dataset.value}$`;
    }
  });

  window.PLRTE = function (uuid, options) {
    if (!options.modules) options.modules = {};
    if (options.readOnly) {
      options.modules.toolbar = false;
    } else {
      options.modules.toolbar = [
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block', { script: 'sub' }, { script: 'super' }, 'formula'],
        [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
        [{ size: ['small', false, 'large'] }],
        [{ header: [1, 2, 3, false] }],
        [{ color: [] }, { background: [] }],
        ['clean'],
      ];
    }

    let inputElement = $('#rte-input-' + uuid);
    let quill = new Quill('#rte-' + uuid, options);
    let renderer = null;
    if (options.format === 'markdown') {
      renderer = new showdown.Converter({
        literalMidWordUnderscores: true,
        literalMidWordAsterisks: true,
      });
    }

    if (options.markdownShortcuts && !options.readOnly) new QuillMarkdown(quill, {});

    let contents = atob(inputElement.val());
    if (contents && renderer) contents = renderer.makeHtml(contents);
    contents = rtePurify.sanitize(contents, rtePurifyConfig);

    quill.setContents(quill.clipboard.convert(contents));

    quill.on('text-change', function () {
      let contents = rtePurify.sanitize(quill.root.innerHTML, rtePurifyConfig);
      if (contents && renderer) contents = renderer.makeMarkdown(contents);
      inputElement.val(
        btoa(
          he.encode(contents, {
            allowUnsafeSymbols: true, // HTML tags should be kept
            useNamedReferences: true,
          }),
        ),
      );
    });
  };

  // Override default implementation of 'formula'

  var Embed = Quill.imports.parchment.Embed;

  class MathFormula extends Embed {
    static create(value) {
      const node = super.create(value);
      if (typeof value === 'string') {
        this.updateNode(node, value);
      }
      return node;
    }

    static updateNode(node, value) {
      MathJax.startup.promise.then(async () => {
        const html = await (MathJax.tex2chtmlPromise || MathJax.tex2svgPromise)(value);
        const formatted = html.innerHTML;
        // Without trailing whitespace, cursor will not appear at end of text if LaTeX is at end
        node.innerHTML = formatted + '&#8201;';
        node.contentEditable = 'false';
        node.setAttribute('data-value', value);
      });
    }

    static value(domNode) {
      return domNode.getAttribute('data-value');
    }
  }
  MathFormula.blotName = 'formula';
  MathFormula.className = 'ql-formula';
  MathFormula.tagName = 'SPAN';

  Quill.register('formats/formula', MathFormula, true);
})();
