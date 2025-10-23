/* global Quill, he, MathJax, QuillMarkdown, DOMPurify, bootstrap */

(() => {
  // @ts-expect-error - DOMPurify global is declared but not typed correctly
  const rtePurify = DOMPurify();
  const rtePurifyConfig = { SANITIZE_NAMED_PROPS: true };

  rtePurify.addHook(
    'uponSanitizeElement',
    /**
     * @param {any} node
     * @param {any} data
     */
    (node, data) => {
      if (data.tagName === 'span' && node.classList.contains('ql-formula')) {
        // Quill formulas don't need their SVG content in the sanitized version,
        // as they are re-rendered upon loading.
        node.innerText = `$${node.dataset.value}$`;
      }
    },
  );

  class Counter {
    /**
     * @param {string} unit
     * @param {string} uuid
     * @param {() => string} getText
     */
    constructor(unit, uuid, getText) {
      this.unit = unit;
      this.container = document.getElementById(`rte-counter-${uuid}`);
      this.getText = getText;

      // Eagerly populate the container
      this.update();
    }

    /**
     * @param {string} text
     */
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
      const length = this.calculate(this.getText()) || 0;
      const label = `${this.unit}${length === 1 ? '' : 's'}`;
      if (this.container) {
        this.container.innerText = `${length} ${label}`;
      }
    }
  }

  // @ts-expect-error - Quill global is declared but not fully typed
  const Clipboard = Quill.import('modules/clipboard');
  class PotentiallyDisabledClipboard extends Clipboard {
    /**
     * @param {ClipboardEvent} e
     * @param {boolean} [isCut]
     */
    onCaptureCopy(e, isCut = false) {
      // @ts-expect-error - options is available on clipboard modules
      if (this.options.enabled ?? true) return super.onCaptureCopy(e, isCut);
      if (!e.defaultPrevented) e.preventDefault();
      this.showToast();
    }

    /**
     * @param {ClipboardEvent} e
     */
    onCapturePaste(e) {
      // @ts-expect-error - options is available on clipboard modules
      if (this.options.enabled ?? true) return super.onCapturePaste(e);
      if (!e.defaultPrevented) e.preventDefault();
      this.showToast();
    }

    showToast() {
      if (!this.toast) {
        // @ts-expect-error - options is available on clipboard modules
        const toastElement = document.getElementById(this.options.toast_id);
        // @ts-expect-error - bootstrap global is declared but not fully typed
        this.toast = toastElement
          ? new bootstrap.Toast(toastElement, { autohide: true, delay: 2000 })
          : null;
      }
      if (this.toast) {
        this.toast.show();
      }
    }
  }

  // @ts-expect-error - Quill global is declared but not fully typed
  Quill.register('modules/clipboard', PotentiallyDisabledClipboard, true);

  /**
   * @param {string} uuid
   */
  // @ts-expect-error - TypeScript doesn't recognize PLRTE as a valid property
  window.PLRTE = async function (uuid) {
    const baseElement = document.getElementById(`rte-${uuid}`);
    if (!baseElement) throw new Error(`Element not found: rte-${uuid}`);
    /** @type {any} */
    const options = JSON.parse(baseElement.dataset.options || '{}');

    if (!options.modules) options.modules = {};
    if (!options.modules.clipboard) options.modules.clipboard = {};
    options.modules.clipboard.toast_id = 'rte-clipboard-toast-' + uuid;
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

    options.modules.keyboard = {
      bindings: {
        tab: {
          key: 9,
          handler: () => {
            // Overrides Quill tab behavior that inserts a tab character.
            // Retains other Quill tab behaviours (indent list items or code
            // blocks, switch cells in table), falling back to the browser's
            // default behavior (focus on next focusable element) for
            // accessibility.
            // https://quilljs.com/docs/modules/keyboard#configuration
            return true;
          },
        },
      },
    };

    // Set the bounds for UI elements (e.g., the tooltip for the formula editor)
    // to the question container.
    // https://quilljs.com/docs/configuration#bounds
    options.bounds = baseElement.closest('.question-container');

    const inputElement = $('#rte-input-' + uuid);
    // @ts-expect-error - Quill global is declared but not fully typed
    const quill = new Quill(baseElement, options);
    initializeFormulaPopover(quill, uuid);

    // @ts-expect-error - QuillMarkdown global is declared but not fully typed
    if (options.markdownShortcuts && !options.readOnly) new QuillMarkdown(quill, {});

    const inputValue = inputElement.val();
    let contents = typeof inputValue === 'string' ? atob(inputValue) : '';
    if (contents && options.format === 'markdown') {
      const marked = (await import('marked')).marked;
      const parsed = await marked.parse(contents);
      contents = typeof parsed === 'string' ? parsed : contents;
    }
    contents = rtePurify.sanitize(contents, rtePurifyConfig);

    quill.setContents(quill.clipboard.convert({ html: contents }));
    // Ensure that the initial content is not part of the undo stack
    quill.history.clear();

    const getText = () => quill.getText();
    const counter = options.counter === 'none' ? null : new Counter(options.counter, uuid, getText);

    const updateHiddenInput = function () {
      // If a user types something and erases it, the editor will be blank, but
      // the content will be something like `<p></p>`. In order to make sure
      // this is treated as blank by the element's parse code and tagged as
      // invalid if allow-blank is not true, we explicitly set the value to an
      // empty string if the editor is blank. This is done using the `isBlank`
      // method, used by Quill to determine if the placeholder should be shown.
      // This is not a perfect solution, since it will not catch cases like
      // content with only a space or a bulleted list without text, but we're ok
      // with this caveat.
      //
      // An alternative solution would be to use the `getText` method, but this
      // would cause a false positive for elements that are part of the answer
      // but don't have a text (e.g., images).
      //
      // Because `isBlank` is undocumented, this solution may break in the
      // future (see https://github.com/slab/quill/issues/4254). To ensure that
      // the element continues to work if this method is removed, we use
      // optional chaining in the call. This would cause the empty check to
      // fail but not crash, so the element can continue working.
      const contents = quill.editor?.isBlank?.()
        ? ''
        : rtePurify.sanitize(quill.getSemanticHTML(), rtePurifyConfig);
      inputElement.val(
        btoa(
          // @ts-expect-error - he global is declared but not typed
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
    };

    quill.on('text-change', updateHiddenInput);
    updateHiddenInput();
  };

  // Override default implementation of 'formula'

  // @ts-expect-error - Quill global is declared but not fully typed
  const Embed = Quill.import('blots/embed');

  class MathFormula extends Embed {
    /**
     * @param {string} value
     */
    static create(value) {
      const node = super.create(value);
      if (typeof value === 'string') {
        this.updateNode(node, value);
      }
      return node;
    }

    /**
     * @param {HTMLElement} node
     * @param {string} value
     */
    static updateNode(node, value) {
      node.setAttribute('data-value', value);
      void MathJax.startup.promise.then(async () => {
        // @ts-expect-error - MathJax promise methods are not typed
        const html = await (MathJax.tex2chtmlPromise || MathJax.tex2svgPromise)(value);
        node.innerHTML = html.innerHTML;
        node.contentEditable = 'false';
      });
    }

    /**
     * @param {HTMLElement} domNode
     */
    static value(domNode) {
      return domNode.getAttribute('data-value');
    }
  }
  MathFormula.blotName = 'formula';
  MathFormula.className = 'ql-formula';
  MathFormula.tagName = 'SPAN';

  // @ts-expect-error - Quill global is declared but not fully typed
  Quill.register('formats/formula', MathFormula, true);
})();

/**
 * @param {any} quill
 * @param {string} uuid
 */
function initializeFormulaPopover(quill, uuid) {
  const formulaButton = quill.getModule('toolbar')?.container?.querySelector('.ql-formula');
  // If the formula button is not present (e.g., the editor is read-only), do not initialize the popover
  if (!formulaButton) return;

  const popoverContent = document.createElement('form');
  popoverContent.innerHTML = `
    <div class="mb-3">
      <label for="rte-formula-input-${uuid}">Formula:</label>
      <input type="text" class="form-control" id="rte-formula-input-${uuid}" placeholder="Enter Formula" />
    </div>
    <div class="mb-3" id="rte-formula-input-preview-${uuid}">
    </div>
    <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
    <button type="submit" class="btn btn-primary">Confirm</button>
  `;

  // @ts-expect-error - bootstrap global is declared but not fully typed
  const popover = new bootstrap.Popover(formulaButton, {
    content: popoverContent,
    html: true,
    container: '.question-container',
    trigger: 'manual',
    placement: 'bottom',
    // Allow the popover to expand to the full width of the container if the formula input is long
    customClass: 'mw-100',
  });

  const input = /** @type {HTMLInputElement} */ (popoverContent.querySelector('input'));
  input.addEventListener('input', () => {
    const value = input.value.trim();
    void MathJax.startup.promise.then(async () => {
      // @ts-expect-error - MathJax promise methods are not typed
      const result = await (MathJax.tex2chtmlPromise || MathJax.tex2svgPromise)(value);
      const html = value
        ? result.outerHTML
        : '<div class="text-muted">Type a Latex formula, e.g., <code>e=mc^2</code></div>';
      const previewElement = popoverContent.querySelector(`#rte-formula-input-preview-${uuid}`);
      if (previewElement) {
        previewElement.innerHTML = html;
      }
      // Adjust the popover position if the content changes the size of the popover
      popover.update();
    });
  });

  popoverContent.addEventListener('submit', (e) => {
    e.preventDefault();
    popover.hide();
    const value = input.value.trim();
    if (!value) return;

    const range = quill.getSelection(true) || { index: 0, length: 0 };
    if (range.length > 0) quill.deleteText(range.index, range.length, 'user');
    quill.insertEmbed(range.index, 'formula', value, 'user');
    // Without trailing whitespace, cursor will not appear at end of text if
    // LaTeX is at end. Also done by original handler:
    // https://github.com/slab/quill/blob/ebe16ca24724ac4f52505628ac2c4934f0a98b85/packages/quill/src/themes/base.ts#L315
    quill.insertText(range.index + 1, ' ', 'user');
    quill.setSelection(range.index + 2, 0, 'user');
  });

  formulaButton.addEventListener('hide.bs.popover', () => {
    quill.focus();
  });

  quill.getModule('toolbar').addHandler(
    'formula',
    /** @param {boolean} enabled */ (enabled) => {
      if (!enabled) return;
      const range = quill.getSelection(true);
      // If there is a selection, set the input value to the selected text
      input.value = range?.length ? quill.getText(range.index, range.length) : '';
      // Trigger input event to show initial preview or clear previous preview
      input.dispatchEvent(new InputEvent('input'));
      popover.show();
    },
  );
}
