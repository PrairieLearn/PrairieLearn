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

  class Counter {
    constructor(unit, uuid, getText) {
      this.unit = unit;
      this.container = document.getElementById(`rte-counter-${uuid}`);
      this.getText = getText;

      // Eagerly populate the container
      this.update();
    }

    calculate(text) {
      if (this.unit === 'word') {
        const trimmed = text.trim();
        // Splitting empty text returns a non-empty array
        return trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
      } else if (this.unit === 'character') {
        // Use a spread so that Unicode characters are counted instead of utf-16 code units
        return [...text].length;
      } else {
        console.error(`Text count not implemented for unit type: ${this.unit}`);
      }
    }

    update() {
      const length = this.calculate(this.getText());
      const label = `${this.unit}${length === 1 ? '' : 's'}`;
      this.container.innerText = `${length} ${label}`;
    }
  }

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

    quill.setContents(quill.clipboard.convert({ html: contents }));

    const getText = () => quill.getText();
    const counter = options.counter === 'none' ? null : new Counter(options.counter, uuid, getText);

    quill.on('text-change', function () {
      let contents = rtePurify.sanitize(quill.getSemanticHTML(), rtePurifyConfig);
      if (contents && renderer) contents = renderer.makeMarkdown(contents);
      inputElement.val(
        btoa(
          he.encode(contents, {
            allowUnsafeSymbols: true, // HTML tags should be kept
            useNamedReferences: true,
          }),
        ),
      );

      // Update character/word count
      if (counter) {
        counter.update();
      }
    });
  };

  // Override default implementation of 'formula'

  var Embed = Quill.import('blots/embed');

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
