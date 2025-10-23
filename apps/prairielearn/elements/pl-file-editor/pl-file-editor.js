/* global ace, MathJax, DOMPurify */

/**
 * @typedef {object} PLFileEditorOptions
 * @property {string} [originalContents]
 * @property {Record<string, (content: string) => string | Promise<string>>} [preview]
 * @property {string} [preview_type]
 * @property {boolean} [readOnly]
 * @property {string} [aceMode]
 * @property {string} [aceTheme]
 * @property {number} [fontSize]
 * @property {number} [minLines]
 * @property {number} [maxLines]
 * @property {boolean} [autoResize]
 * @property {boolean} [plOptionFocus]
 * @property {string} [currentContents]
 */

/**
 * @param {string} uuid
 * @param {PLFileEditorOptions} options
 * @this {PLFileEditor}
 */
function PLFileEditor(uuid, options) {
  const elementId = '#file-editor-' + uuid;
  this.element = $(elementId);
  if (this.element.length === 0) {
    throw new Error('File upload element ' + elementId + ' was not found!');
  }
  this.originalContents = options.originalContents ?? '';

  this.inputElement = this.element.find('input');
  this.editorElement = this.element.find('.editor');
  this.settingsButton = this.element.find('.settings-button');
  this.modal = this.element.find('.modal');
  this.saveSettingsButton = this.element.find('.save-settings-button');
  this.closeSettingsButton = this.element.find('.close-settings-button');
  this.restoreOriginalButton = this.element.find('.restore-original');
  this.restoreOriginalConfirmContainer = this.element.find('.restore-original-confirm-container');
  this.restoreOriginalConfirm = this.element.find('.restore-original-confirm');
  this.restoreOriginalCancel = this.element.find('.restore-original-cancel');
  // @ts-expect-error - ace types don't accept second parameter but it exists
  this.editor = ace.edit(this.editorElement.get(0), {
    enableKeyboardAccessibility: true,
  });
  this.editor.setTheme('ace/theme/chrome');
  this.editor.getSession().setUseWrapMode(true);
  this.editor.setShowPrintMargin(false);
  this.editor.setReadOnly(options.readOnly || false);
  this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

  if (options.aceMode) {
    this.editor.getSession().setMode(options.aceMode);
  }

  const theme = localStorage.getItem('pl-file-editor-theme');
  if (theme) {
    this.editor.setTheme(theme);
  } else if (options.aceTheme) {
    this.editor.setTheme(options.aceTheme);
  } else {
    this.editor.setTheme('ace/theme/chrome');
  }

  const fontSize = localStorage.getItem('pl-file-editor-fontsize');
  if (fontSize) {
    this.editor.setFontSize(fontSize);
  } else if (options.fontSize) {
    this.editor.setFontSize(String(options.fontSize));
  } else {
    this.editor.setFontSize('12');
  }

  const keyboardHandler = localStorage.getItem('pl-file-editor-keyboardHandler');
  if (keyboardHandler) {
    this.editor.setKeyboardHandler(keyboardHandler);
  }

  if (options.minLines) {
    this.editor.setOption('minLines', options.minLines);
  }

  if (options.maxLines) {
    this.editor.setOption('maxLines', options.maxLines);
  }

  if (options.autoResize) {
    // @ts-expect-error - setAutoScrollEditorIntoView method exists but not in types
    this.editor.setAutoScrollEditorIntoView(true);
    this.editor.setOption('maxLines', Infinity);
  }

  this.plOptionFocus = options.plOptionFocus;

  /** @type {Record<string, (value: string) => Promise<string> | string>} */
  this.preview = {};

  let currentContents = '';
  if (options.currentContents) {
    currentContents = this.b64DecodeUnicode(options.currentContents);
  }
  this.setEditorContents(currentContents, { resetUndo: true });

  if (options.preview) {
    const previewType = typeof options.preview === 'string' ? options.preview : 'default';
    this.editor.session.on('change', () => this.updatePreview(previewType));
    void this.updatePreview(previewType);
  }

  this.syncSettings();

  this.initSettingsButton(uuid);

  this.initRestoreOriginalButton();
}

PLFileEditor.prototype.syncSettings = function () {
  window.addEventListener('storage', (event) => {
    if (event.key === 'pl-file-editor-theme' && event.newValue) {
      this.editor.setTheme(event.newValue);
    }
    if (event.key === 'pl-file-editor-fontsize' && event.newValue) {
      this.editor.setFontSize(event.newValue);
    }
    if (event.key === 'pl-file-editor-keyboardHandler' && event.newValue) {
      this.editor.setKeyboardHandler(event.newValue);
    }
  });

  window.addEventListener('pl-file-editor-settings-changed', () => {
    const theme = localStorage.getItem('pl-file-editor-theme');
    if (theme) this.editor.setTheme(theme);

    const fontSize = localStorage.getItem('pl-file-editor-fontsize');
    if (fontSize) this.editor.setFontSize(fontSize);

    const keyboardHandler = localStorage.getItem('pl-file-editor-keyboardHandler');
    if (keyboardHandler) this.editor.setKeyboardHandler(keyboardHandler);
  });
};

/**
 * @this {PLFileEditor}
 * @param {string} preview_type
 */
PLFileEditor.prototype.updatePreview = async function (preview_type) {
  /** @type {HTMLElement} */
  const preview = this.element.find('.preview')[0];
  let shadowRoot = preview.shadowRoot;
  if (!shadowRoot) {
    shadowRoot = preview.attachShadow({ mode: 'open' });
    // MathJax includes assistive content that is not visible by default (i.e.,
    // only readable by screen readers). The hiding of this content is found in
    // a style tag in the head, but this tag is not applied to the shadow DOM by
    // default, so we need to manually adopt the MathJax styles.
    await MathJax.startup.promise;
    const mjxStyles = document.getElementById('MJX-SVG-styles');
    if (mjxStyles?.textContent) {
      const style = new CSSStyleSheet();
      style.replaceSync(mjxStyles.textContent);
      shadowRoot.adoptedStyleSheets.push(style);
    }
  }

  const editor_value = this.editor.getValue();
  const default_preview_text = '<p>Begin typing above to preview</p>';
  const previewFn = this.preview[preview_type];
  const html_contents = await Promise.resolve(previewFn(editor_value));

  if (html_contents.trim().length === 0) {
    shadowRoot.innerHTML = default_preview_text;
  } else {
    const sanitized_contents = DOMPurify.sanitize(html_contents);
    shadowRoot.innerHTML = sanitized_contents;
    if (
      sanitized_contents.includes('$') ||
      sanitized_contents.includes('\\(') ||
      sanitized_contents.includes('\\)') ||
      sanitized_contents.includes('\\[') ||
      sanitized_contents.includes('\\]')
    ) {
      void MathJax.typesetPromise([...shadowRoot.children]);
    }
  }
};

/**
 * @this {PLFileEditor}
 * @param {string} uuid
 */
PLFileEditor.prototype.initSettingsButton = function (uuid) {
  this.settingsButton.click(() => {
    // @ts-expect-error - ace.require types are incorrect for the callback parameter
    ace.require(['ace/ext/themelist'], (themeList) => {
      const themeSelect = this.modal.find('#modal-' + uuid + '-themes');
      themeSelect.empty();
      for (const entries in themeList.themesByName) {
        const caption = themeList.themesByName[entries].caption;
        const theme = themeList.themesByName[entries].theme;

        themeSelect.append(
          $('<option>', {
            value: theme,
            text: caption,
            selected: localStorage.getItem('pl-file-editor-theme') === theme,
          }),
        );
      }

      const fontSizeList = ['12px', '14px', '16px', '18px', '20px', '22px', '24px'];
      const fontSelect = this.modal.find('#modal-' + uuid + '-fontsize');
      fontSelect.empty();
      for (const fontSize of fontSizeList) {
        fontSelect.append(
          $('<option>', {
            value: fontSize,
            text: fontSize,
            selected: localStorage.getItem('pl-file-editor-fontsize') === fontSize,
          }),
        );
      }

      const keyboardHandlerList = ['Default', 'Vim', 'Emacs', 'Sublime', 'VSCode'];
      const keyboardHandlerSelect = this.modal.find('#modal-' + uuid + '-keyboardHandler');
      keyboardHandlerSelect.empty();
      for (const keyboardHandlerName of keyboardHandlerList) {
        const keyboardHandler = 'ace/keyboard/' + keyboardHandlerName.toLowerCase();

        keyboardHandlerSelect.append(
          $('<option>', {
            value: keyboardHandler,
            text: keyboardHandlerName,
            selected: localStorage.getItem('pl-file-editor-keyboardHandler') === keyboardHandler,
          }),
        );
      }
    });
    this.modal.modal('show');
    sessionStorage.setItem('pl-file-editor-theme-current', this.editor.getTheme());
    // @ts-expect-error - getFontSize method exists but not in types
    sessionStorage.setItem('pl-file-editor-fontsize-current', String(this.editor.getFontSize()));
    const savedHandler = localStorage.getItem('pl-file-editor-keyboardHandler');
    if (savedHandler) {
      sessionStorage.setItem('pl-file-editor-keyboardHandler-current', savedHandler);
    }

    this.modal.find('#modal-' + uuid + '-themes').change((e) => {
      const themeValue = $(e.currentTarget).val();
      if (typeof themeValue === 'string') {
        this.editor.setTheme(themeValue);
      }
    });
    this.modal.find('#modal-' + uuid + '-fontsize').change((e) => {
      const fontSizeValue = $(e.currentTarget).val();
      if (typeof fontSizeValue === 'string') {
        this.editor.setFontSize(fontSizeValue);
      }
    });
  });

  this.saveSettingsButton.click(() => {
    const themeValue = this.modal.find('#modal-' + uuid + '-themes').val();
    const fontsizeValue = this.modal.find('#modal-' + uuid + '-fontsize').val();
    const keyboardHandlerValue = this.modal.find('#modal-' + uuid + '-keyboardHandler').val();

    if (typeof themeValue === 'string') localStorage.setItem('pl-file-editor-theme', themeValue);
    if (typeof fontsizeValue === 'string') {
      localStorage.setItem('pl-file-editor-fontsize', fontsizeValue);
    }
    if (typeof keyboardHandlerValue === 'string') {
      localStorage.setItem('pl-file-editor-keyboardHandler', keyboardHandlerValue);
    }
    if (keyboardHandlerValue === 'ace/keyboard/default') {
      localStorage.removeItem('pl-file-editor-keyboardHandler');
    }

    sessionStorage.removeItem('pl-file-editor-theme-current');
    sessionStorage.removeItem('pl-file-editor-fontsize-current');
    sessionStorage.removeItem('pl-file-editor-keyboardHandler-current');

    const theme = localStorage.getItem('pl-file-editor-theme');
    const fontSize = localStorage.getItem('pl-file-editor-fontsize');
    const handler = localStorage.getItem('pl-file-editor-keyboardHandler');

    if (theme) this.editor.setTheme(theme);
    if (fontSize) this.editor.setFontSize(fontSize);
    if (handler) this.editor.setKeyboardHandler(handler);

    window.dispatchEvent(new Event('pl-file-editor-settings-changed'));
    this.modal.modal('hide');
  });

  this.closeSettingsButton.click(() => {
    const theme = sessionStorage.getItem('pl-file-editor-theme-current');
    const fontSize = sessionStorage.getItem('pl-file-editor-fontsize-current');
    const handler = sessionStorage.getItem('pl-file-editor-keyboardHandler-current');

    if (theme) this.editor.setTheme(theme);
    if (fontSize) this.editor.setFontSize(fontSize);
    if (handler) this.editor.setKeyboardHandler(handler);

    sessionStorage.removeItem('pl-file-editor-theme-current');
    sessionStorage.removeItem('pl-file-editor-fontsize-current');
    sessionStorage.removeItem('pl-file-editor-keyboardHandler-current');
  });

  this.modal.on('hidden.bs.modal', () => {
    const theme = sessionStorage.getItem('pl-file-editor-theme-current');
    const fontSize = sessionStorage.getItem('pl-file-editor-fontsize-current');
    const handler = sessionStorage.getItem('pl-file-editor-keyboardHandler-current');

    if (theme) this.editor.setTheme(theme);
    if (fontSize) this.editor.setFontSize(fontSize);
    if (handler) this.editor.setKeyboardHandler(handler);

    sessionStorage.removeItem('pl-file-editor-theme-current');
    sessionStorage.removeItem('pl-file-editor-fontsize-current');
    sessionStorage.removeItem('pl-file-editor-keyboardHandler-current');
  });
};

/**
 * @this {PLFileEditor}
 */
PLFileEditor.prototype.initRestoreOriginalButton = function () {
  this.restoreOriginalButton.click(() => {
    this.restoreOriginalButton.hide();
    this.restoreOriginalConfirmContainer.show();
    this.restoreOriginalConfirm.focus();
  });

  this.restoreOriginalConfirm.click(() => {
    this.restoreOriginalConfirmContainer.hide();
    this.restoreOriginalButton.show();
    this.restoreOriginalButton.focus();
    this.setEditorContents(this.b64DecodeUnicode(this.originalContents));
  });

  this.restoreOriginalCancel.click(() => {
    this.restoreOriginalConfirmContainer.hide();
    this.restoreOriginalButton.show();
    this.restoreOriginalButton.focus();
  });
};

/**
 * @this {PLFileEditor}
 * @param {string} contents
 * @param {{ resetUndo?: boolean }} [options]
 */
PLFileEditor.prototype.setEditorContents = function (contents, { resetUndo = false } = {}) {
  if (resetUndo) {
    // Setting the value of the session causes the undo manager to be reset.
    // https://github.com/ajaxorg/ace/blob/35e1be52fd8172405cf0f219bab1ef7571b3363f/src/edit_session.js#L321-L328
    this.editor.session.setValue(contents);
  } else {
    // Using setValue directly adds the change to the undo manager.
    this.editor.setValue(contents);
  }
  this.editor.gotoLine(1, 0);
  if (this.plOptionFocus) {
    this.editor.focus();
  }
  this.syncFileToHiddenInput();
};

/**
 * @this {PLFileEditor}
 */
PLFileEditor.prototype.syncFileToHiddenInput = function () {
  this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

/**
 * @this {PLFileEditor}
 * @param {string} str
 */
PLFileEditor.prototype.b64DecodeUnicode = function (str) {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  return decodeURIComponent(
    atob(str)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join(''),
  );
};

/**
 * @this {PLFileEditor}
 * @param {string} str
 */
PLFileEditor.prototype.b64EncodeUnicode = function (str) {
  // first we use encodeURIComponent to get percent-encoded UTF-8,
  // then we convert the percent encodings into raw bytes which
  // can be fed into btoa.
  return btoa(
    encodeURIComponent(str).replaceAll(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
      return String.fromCharCode(Number.parseInt('0x' + p1, 16));
    }),
  );
};

PLFileEditor.prototype.preview = {
  /** @param {string} value */
  html: (value) => value,
  markdown: (() => {
    /** @type {typeof import('marked').marked | null} */
    let marked = null;
    /** @param {string} value */
    return async (value) => {
      if (marked == null) {
        marked = (await import('marked')).marked;
        await MathJax.startup.promise;
        // @ts-expect-error - addMathjaxExtension signature is complex
        (await import('@prairielearn/marked-mathjax')).addMathjaxExtension(marked, MathJax);
      }
      return marked.parse(value);
    };
  })(),
  dot: (() => {
    /** @type {Promise<unknown> | null} */
    let vizPromise = null;
    /** @param {string} value */
    return async (value) => {
      try {
        // Only load/create instance on first call.
        if (vizPromise == null) {
          vizPromise = (async () => {
            const { instance } = await import('@viz-js/viz');
            return instance();
          })();
        }
        const viz = await vizPromise;
        // @ts-expect-error - viz-js types are not well-defined
        return viz.renderString(value, { format: 'svg' });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        return `<span class="text-danger">${error.message}</span>`;
      }
    };
  })(),
  // Additional preview types can be created by extensions, by adding entries to PLFileEditor.prototype.preview.
};

/** @type {new (uuid: string, options: PLFileEditorOptions) => PLFileEditor} */
window.PLFileEditor = PLFileEditor;
