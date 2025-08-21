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

  if (options.preview) {
    this.editor.session.on('change', () => this.updatePreview(options.preview));
    this.updatePreview(options.preview);
  }

  let currentContents = '';
  if (options.currentContents) {
    currentContents = this.b64DecodeUnicode(options.currentContents);
  }
  this.setEditorContents(currentContents);

  this.syncSettings();

  this.initSettingsButton(uuid);

  this.initRestoreOriginalButton();
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
  const editor_value = this.editor.getValue();
  const default_preview_text = '<p>Begin typing above to preview</p>';
  const html_contents = editor_value
    ? ((await Promise.resolve(this.preview[preview_type]?.(editor_value))) ??
      `<p>Unknown preview type: <code>${preview_type}</code></p>`)
    : '';

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
    if (mjxStyles) {
      const style = new CSSStyleSheet();
      style.replaceSync(mjxStyles.textContent);
      shadowRoot.adoptedStyleSheets.push(style);
    }
  }
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

window.PLFileEditor.prototype.setEditorContents = function (contents) {
  this.editor.setValue(contents);
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

window.PLFileEditor.prototype.b64EncodeUnicode = function (str) {
  // first we use encodeURIComponent to get percent-encoded UTF-8,
  // then we convert the percent encodings into raw bytes which
  // can be fed into btoa.
  return btoa(
    encodeURIComponent(str).replaceAll(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
      return String.fromCharCode('0x' + p1);
    }),
  );
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
