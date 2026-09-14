/* global ace, MathJax, DOMPurify */

window.PLFileEditor = function (uuid, options) {
  const elementId = '#file-editor-' + uuid;
  this.element = $(elementId);
  if (!this.element) {
    throw new Error('File upload element ' + elementId + ' was not found!');
  }
  this.originalContents = options.originalContents || '';

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
  this.editor = ace.edit(this.editorElement.get(0), {
    enableKeyboardAccessibility: true,
  });
  this.editor.setTheme('ace/theme/chrome');
  this.editor.getSession().setUseWrapMode(true);
  this.editor.setShowPrintMargin(false);
  this.editor.setReadOnly(options.readOnly);
  this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

  if (options.aceMode) {
    if (options.aceModePath) {
      // Retrieve the mode from a custom path (course or question-specific).
      ace.config.setModuleUrl(options.aceMode, options.aceModePath);
    }
    this.editor.getSession().setMode(options.aceMode);
  }

  if (localStorage.getItem('pl-file-editor-theme')) {
    this.editor.setTheme(localStorage.getItem('pl-file-editor-theme'));
  } else if (options.aceTheme) {
    this.editor.setTheme(options.aceTheme);
  } else {
    this.editor.setTheme('ace/theme/chrome');
  }

  if (localStorage.getItem('pl-file-editor-fontsize')) {
    this.editor.setFontSize(localStorage.getItem('pl-file-editor-fontsize'));
  } else if (options.fontSize) {
    this.editor.setFontSize(options.fontSize);
  } else {
    this.editor.setFontSize(12);
  }

  this.editor.setKeyboardHandler(localStorage.getItem('pl-file-editor-keyboardHandler'));

  if (options.minLines) {
    this.editor.setOption('minLines', options.minLines);
  }

  if (options.maxLines) {
    this.editor.setOption('maxLines', options.maxLines);
  }

  if (options.autoResize) {
    this.editor.setAutoScrollEditorIntoView(true);
    this.editor.setOption('maxLines', Infinity);
  }

  this.plOptionFocus = options.plOptionFocus;

  let currentContents = '';
  if (options.currentContents) {
    currentContents = this.b64DecodeUnicode(options.currentContents);
  }
  this.setEditorContents(currentContents, { resetUndo: true });

  if (options.preview) {
    this.editor.session.on('change', () => this.updatePreview(options.preview));
    this.updatePreview(options.preview);
  }

  this.syncSettings();

  this.initSettingsButton(uuid);
  if (options.preview) initFileEditorFullscreen(this);

  if (!options.readOnly) {
    this.initRestoreOriginalButton();
  }
};

window.PLFileEditor.prototype.syncSettings = function () {
  window.addEventListener('storage', (event) => {
    if (event.key === 'pl-file-editor-theme') {
      this.editor.setTheme(event.newValue);
    }
    if (event.key === 'pl-file-editor-fontsize') {
      this.editor.setFontSize(event.newValue);
    }
    if (event.key === 'pl-file-editor-keyboardHandler') {
      this.editor.setKeyboardHandler(event.newValue);
    }
  });

  window.addEventListener('pl-file-editor-settings-changed', () => {
    this.editor.setTheme(localStorage.getItem('pl-file-editor-theme'));
    this.editor.setFontSize(localStorage.getItem('pl-file-editor-fontsize'));
    this.editor.setKeyboardHandler(localStorage.getItem('pl-file-editor-keyboardHandler'));
  });
};

window.PLFileEditor.prototype.updatePreview = async function (preview_type) {
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
    const mjxStyles = MathJax.svgStylesheet();
    if (mjxStyles) {
      const style = new CSSStyleSheet();
      style.replaceSync(mjxStyles.textContent);
      shadowRoot.adoptedStyleSheets.push(style);
    }
  }

  const editor_value = this.editor.getValue();
  const default_preview_text = '<p>Begin typing above to preview</p>';
  const html_contents = editor_value
    ? ((await Promise.resolve(this.preview[preview_type]?.(editor_value))) ??
      `<p>Unknown preview type: <code>${preview_type}</code></p>`)
    : '';

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
      MathJax.typesetPromise(shadowRoot.children);
    }
  }
};

window.PLFileEditor.prototype.initSettingsButton = function (uuid) {
  this.settingsButton.click(() => {
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
      for (const entries in fontSizeList) {
        fontSelect.append(
          $('<option>', {
            value: fontSizeList[entries],
            text: fontSizeList[entries],
            selected: localStorage.getItem('pl-file-editor-fontsize') === fontSizeList[entries],
          }),
        );
      }

      const keyboardHandlerList = ['Default', 'Vim', 'Emacs', 'Sublime', 'VSCode'];
      const keyboardHandlerSelect = this.modal.find('#modal-' + uuid + '-keyboardHandler');
      keyboardHandlerSelect.empty();
      for (const index in keyboardHandlerList) {
        const keyboardHandler = 'ace/keyboard/' + keyboardHandlerList[index].toLowerCase();

        keyboardHandlerSelect.append(
          $('<option>', {
            value: keyboardHandler,
            text: keyboardHandlerList[index],
            selected: localStorage.getItem('pl-file-editor-keyboardHandler') === keyboardHandler,
          }),
        );
      }
    });
    this.modal.modal('show');
    sessionStorage.setItem('pl-file-editor-theme-current', this.editor.getTheme());
    sessionStorage.setItem('pl-file-editor-fontsize-current', this.editor.getFontSize());
    if (localStorage.getItem('pl-file-editor-keyboardHandler')) {
      sessionStorage.setItem(
        'pl-file-editor-keyboardHandler-current',
        localStorage.getItem('pl-file-editor-keyboardHandler'),
      );
    }

    this.modal.find('#modal-' + uuid + '-themes').change((e) => {
      const theme = $(e.currentTarget).val();
      this.editor.setTheme(theme);
    });
    this.modal.find('#modal-' + uuid + '-fontsize').change((e) => {
      const fontSize = $(e.currentTarget).val();
      this.editor.setFontSize(fontSize);
    });
  });

  this.saveSettingsButton.click(() => {
    const theme = this.modal.find('#modal-' + uuid + '-themes').val();
    const fontsize = this.modal.find('#modal-' + uuid + '-fontsize').val();
    const keyboardHandler = this.modal.find('#modal-' + uuid + '-keyboardHandler').val();

    localStorage.setItem('pl-file-editor-theme', theme);
    localStorage.setItem('pl-file-editor-fontsize', fontsize);
    localStorage.setItem('pl-file-editor-keyboardHandler', keyboardHandler);
    if (keyboardHandler === 'ace/keyboard/default') {
      localStorage.removeItem('pl-file-editor-keyboardHandler');
    }

    sessionStorage.removeItem('pl-file-editor-theme-current');
    sessionStorage.removeItem('pl-file-editor-fontsize-current');
    sessionStorage.removeItem('pl-file-editor-keyboardHandler-current');

    this.editor.setTheme(localStorage.getItem('pl-file-editor-theme'));
    this.editor.setFontSize(localStorage.getItem('pl-file-editor-fontsize'));
    this.editor.setKeyboardHandler(localStorage.getItem('pl-file-editor-keyboardHandler'));

    window.dispatchEvent(new Event('pl-file-editor-settings-changed'));
    this.modal.modal('hide');
  });

  this.closeSettingsButton.click(() => {
    this.editor.setTheme(sessionStorage.getItem('pl-file-editor-theme-current'));
    this.editor.setFontSize(sessionStorage.getItem('pl-file-editor-fontsize-current'));
    this.editor.setKeyboardHandler(
      sessionStorage.getItem('pl-file-editor-keyboardHandler-current'),
    );

    sessionStorage.removeItem('pl-file-editor-theme-current');
    sessionStorage.removeItem('pl-file-editor-fontsize-current');
    sessionStorage.removeItem('pl-file-editor-keyboardHandler-current');
  });
};

window.PLFileEditor.prototype.initRestoreOriginalButton = function () {
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

window.PLFileEditor.prototype.setEditorContents = function (contents, { resetUndo = false } = {}) {
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

window.PLFileEditor.prototype.syncFileToHiddenInput = function () {
  this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

window.PLFileEditor.prototype.b64DecodeUnicode = function (str) {
  return new TextDecoder().decode(Uint8Array.from(atob(str), (c) => c.charCodeAt(0)));
};

window.PLFileEditor.prototype.b64EncodeUnicode = function (str) {
  const bytes = new TextEncoder().encode(str);
  let binaryString = '';
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binaryString += String.fromCodePoint(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binaryString);
};

window.PLFileEditor.prototype.preview = {
  html: (value) => value,
  markdown: (() => {
    let marked = null;
    return async (value) => {
      if (marked == null) {
        marked = (await import('marked')).marked;
        await MathJax.startup.promise;
        (await import('@prairielearn/marked-mathjax')).addMathjaxExtension(marked, MathJax);
      }
      return marked.parse(value);
    };
  })(),
  dot: (() => {
    let vizPromise = null;
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
        return viz.renderString(value, { format: 'svg' });
      } catch (err) {
        return `<span class="text-danger">${err.message}</span>`;
      }
    };
  })(),
  // Additional preview types can be created by extensions, by adding entries to window.PLFileEditor.prototype.preview.
};

/**
 * Keep the editor in its form while a fixed overlay fills the browser viewport.
 * @param {{element: JQuery<HTMLElement>, editor: import('ace-builds').Ace.Editor, modal: JQuery<HTMLElement>}} fileEditor
 * @returns {void}
 */
function initFileEditorFullscreen(fileEditor) {
  const root = fileEditor.element[0];
  const button = /** @type {HTMLButtonElement | null} */ (root.querySelector('.fullscreen-button'));
  if (!button) return;
  button.hidden = false;
  const label = /** @type {HTMLElement} */ (button.querySelector('.fullscreen-label'));
  /** @type {{minLines: number | undefined, maxLines: number | undefined, overflow: string, scrollX: number, scrollY: number} | undefined} */
  let savedState;

  /** @param {boolean} fullscreen */
  const setFullscreen = (fullscreen) => {
    if (fullscreen === Boolean(savedState)) return;
    if (fullscreen) {
      savedState = {
        minLines: fileEditor.editor.getOption('minLines'),
        maxLines: fileEditor.editor.getOption('maxLines'),
        overflow: document.body.style.overflow,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
      document.body.style.overflow = 'hidden';
      root.classList.add('file-editor-fullscreen');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'File editor');
      // The overlay owns the pane height; Ace must scroll instead of growing.
      fileEditor.editor.setOptions({ minLines: 0, maxLines: 0 });
    } else if (savedState) {
      root.classList.remove('file-editor-fullscreen');
      root.removeAttribute('role');
      root.removeAttribute('aria-modal');
      root.removeAttribute('aria-label');
      document.body.style.overflow = savedState.overflow;
      fileEditor.editor.setOptions({
        minLines: savedState.minLines,
        maxLines: savedState.maxLines,
      });
      fileEditor.editor.resize(true);
      window.scrollTo(savedState.scrollX, savedState.scrollY);
      savedState = undefined;
    }
    label.textContent = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
    button.setAttribute('aria-pressed', String(fullscreen));
    fileEditor.editor.resize(true);
    if (fullscreen) fileEditor.editor.focus();
    else button.focus({ preventScroll: true });
  };

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    // Leave keyboard handling to the settings dialog while it is open.
    if (savedState && event.key === 'Escape' && !fileEditor.modal.hasClass('show')) {
      event.preventDefault();
      event.stopPropagation();
      setFullscreen(false);
    }
  };
  /** @param {FocusEvent} event */
  const onFocusIn = (event) => {
    if (savedState && !root.contains(/** @type {Node} */ (event.target))) fileEditor.editor.focus();
  };
  document.addEventListener('keydown', onKeyDown, { capture: true });
  document.addEventListener('focusin', onFocusIn);
  fileEditor.editor.on('destroy', () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusin', onFocusIn);
    if (savedState) {
      document.body.style.overflow = savedState.overflow;
      root.classList.remove('file-editor-fullscreen');
    }
  });
  button.addEventListener('click', () => setFullscreen(!savedState));
}
