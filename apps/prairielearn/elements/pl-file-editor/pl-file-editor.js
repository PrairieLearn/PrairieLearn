// @ts-check
/** @import {} from "./pl-file-editor-globals.js" */
/* global ace, MathJax, DOMPurify */

/**
 * @typedef {object} FileEditorOptions
 * @property {string} [originalContents] Base64-encoded contents used by Restore original.
 * @property {string} [currentContents] Base64-encoded initial answer.
 * @property {boolean} readOnly Whether answer editing is disabled.
 * @property {string} [aceMode] Ace syntax mode module name.
 * @property {string} [aceModePath] Course-provided URL for a custom mode.
 * @property {string} [aceTheme] Initial theme when no saved preference exists.
 * @property {string} [fontSize] Initial CSS font size.
 * @property {number} [minLines] Minimum visible editor lines.
 * @property {number} [maxLines] Maximum visible editor lines.
 * @property {boolean} [autoResize] Whether the editor grows with its contents.
 * @property {boolean} [plOptionFocus] Whether setting contents also focuses the editor.
 * @property {string} [preview] Key in the extensible preview renderer registry.
 */

/**
 * @typedef {object} PreviewRequest
 * @property {string} type Preview renderer registry key.
 * @property {string} value Snapshot of the answer at scheduling time.
 * @property {number} version Used to discard results superseded by edits.
 */

/**
 * @typedef {object} PreviewMath
 * @property {string} source Sanitized math source and ancestor rendering context.
 * @property {Element} node Token wrapper owning the rendered MathJax nodes.
 */

/** @typedef {(value: string) => string | Promise<string>} PreviewRenderer */

/**
 * @typedef {object} FileEditor
 * @property {JQuery<HTMLElement>} element Root element containing this editor instance.
 * @property {string} originalContents Base64-encoded answer used by Restore original.
 * @property {JQuery<HTMLInputElement>} inputElement Hidden input carrying the submitted answer.
 * @property {JQuery<HTMLElement>} editorElement DOM host passed to Ace.
 * @property {JQuery<HTMLElement>} settingsButton Control opening editor settings.
 * @property {JQuery<HTMLElement>} modal Settings dialog for this instance.
 * @property {JQuery<HTMLElement>} saveSettingsButton Control persisting settings.
 * @property {JQuery<HTMLElement>} closeSettingsButton Control restoring settings when the dialog closes.
 * @property {JQuery<HTMLElement>} restoreOriginalButton Control starting the restore confirmation.
 * @property {JQuery<HTMLElement>} restoreOriginalConfirmContainer Container for restore confirmation controls.
 * @property {JQuery<HTMLElement>} restoreOriginalConfirm Control accepting the restore.
 * @property {JQuery<HTMLElement>} restoreOriginalCancel Control canceling the restore.
 * @property {import('ace-builds').Ace.Editor} editor Ace instance owning the answer and undo history.
 * @property {boolean | undefined} plOptionFocus Whether setting contents also focuses the editor.
 * @property {number} previewVersion Monotonically increasing edit/render generation.
 * @property {PreviewMath[]} previewMath Math wrappers in the committed preview.
 * @property {number | undefined} previewTimer Browser debounce timer.
 * @property {PreviewRequest | null} pendingPreview Latest request awaiting rendering.
 * @property {Promise<void> | null} previewJob Single active render loop.
 * @property {boolean} previewDestroyed Whether future preview work must be ignored.
 * @property {Record<string, PreviewRenderer | undefined>} preview Extension renderer registry.
 * @property {() => void} syncSettings Bind shared editor preference events.
 * @property {(previewType: string) => Promise<void>} updatePreview Schedule the latest answer and await rendering.
 * @property {() => Promise<void>} renderPendingPreviews Drain coalesced preview requests.
 * @property {() => void} destroyPreview Cancel preview updates and release math.
 * @property {(request: PreviewRequest) => Promise<void>} renderPreview Prepare and commit one versioned preview.
 * @property {(uuid: string) => void} initSettingsButton Bind settings controls for an instance.
 * @property {() => void} initRestoreOriginalButton Bind restore confirmation controls.
 * @property {(contents: string, options?: {resetUndo?: boolean}) => void} setEditorContents Replace the answer with optional undo reset.
 * @property {() => void} syncFileToHiddenInput Encode the current answer for submission.
 * @property {(str: string) => string} b64DecodeUnicode Decode base64 into UTF-8 text.
 * @property {(str: string) => string} b64EncodeUnicode Encode UTF-8 text as base64.
 */

/**
 * Ace editor with immediate answer synchronization and asynchronous previews.
 * @class
 * @this {FileEditor}
 * @param {string} uuid Element instance identifier.
 * @param {FileEditorOptions} options
 */
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

  this.previewVersion = 0;
  /** @type {PreviewMath[]} */
  this.previewMath = [];
  /** @type {number | undefined} */
  this.previewTimer = undefined;
  /** @type {PreviewRequest | null} */
  this.pendingPreview = null;
  /** @type {Promise<void> | null} */
  this.previewJob = null;
  this.previewDestroyed = false;

  if (options.preview) {
    const previewType = options.preview;
    this.editor.session.on('change', () => {
      this.previewVersion++;
      clearTimeout(this.previewTimer);
      this.previewTimer = window.setTimeout(() => this.updatePreview(previewType), 200);
    });
    this.editor.on('destroy', () => this.destroyPreview());
    void this.updatePreview(options.preview);
  }

  this.syncSettings();

  this.initSettingsButton(uuid);

  if (!options.readOnly) {
    this.initRestoreOriginalButton();
  }
};

/**
 * Listen for settings changes shared by all file editors.
 * @returns {void}
 * @this {FileEditor}
 */
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

/**
 * Coalesce requests into one render loop; callers can await its completion.
 * @param {string} preview_type
 * @returns {Promise<void>}
 * @this {FileEditor}
 */
window.PLFileEditor.prototype.updatePreview = function (preview_type) {
  clearTimeout(this.previewTimer);
  if (this.previewDestroyed) return Promise.resolve();
  this.pendingPreview = {
    type: preview_type,
    value: this.editor.getValue(),
    version: ++this.previewVersion,
  };
  if (!this.previewJob) {
    this.previewJob = this.renderPendingPreviews().finally(() => {
      this.previewJob = null;
    });
  }
  return this.previewJob;
};

/**
 * Render the newest queued snapshot after the current render completes.
 * @returns {Promise<void>}
 * @this {FileEditor}
 */
window.PLFileEditor.prototype.renderPendingPreviews = async function () {
  while (this.pendingPreview && !this.previewDestroyed) {
    const request = this.pendingPreview;
    this.pendingPreview = null;
    try {
      await this.renderPreview(request);
    } catch (error) {
      // Leave the last completed preview visible and allow the next edit to retry.
      console.error('Unable to render file editor preview', error);
    }
  }
};

/**
 * Release preview state and MathJax ownership when Ace is explicitly destroyed.
 * @returns {void}
 * @this {FileEditor}
 */
window.PLFileEditor.prototype.destroyPreview = function () {
  this.previewDestroyed = true;
  this.previewVersion++;
  this.pendingPreview = null;
  this.previewMath = [];
  clearTimeout(this.previewTimer);
  void MathJax.startup.promise.then(() =>
    MathJax.whenReady(() => {
      const shadowRoot = this.element.find('.preview')[0].shadowRoot;
      if (shadowRoot) {
        MathJax.typesetClear(Array.from(shadowRoot.children));
        shadowRoot.replaceChildren();
      }
    }),
  );
};

/**
 * Prepare sanitized content off-screen and commit only the current version.
 * @param {PreviewRequest} request
 * @returns {Promise<void>}
 * @this {FileEditor}
 */
window.PLFileEditor.prototype.renderPreview = async function (request) {
  await MathJax.startup.promise;
  const html = request.value ? await this.preview[request.type]?.(request.value) : '';
  if (request.version !== this.previewVersion || this.previewDestroyed) return;

  const preview = this.element.find('.preview')[0];
  let shadowRoot = preview.shadowRoot;
  if (!shadowRoot) {
    shadowRoot = preview.attachShadow({ mode: 'open' });
    // MathJax's accessibility styles in the document head do not reach shadow roots.
    const mjxStyles = MathJax.svgStylesheet();
    if (mjxStyles) {
      const style = new CSSStyleSheet();
      style.replaceSync(mjxStyles.textContent);
      shadowRoot.adoptedStyleSheets.push(style);
    }
  }

  const contents = html ?? `<p>Unknown preview type: <code>${request.type}</code></p>`;
  // Prepare the next preview off-screen so the current one stays visible until
  // math is ready. Match its width and shadow-root styles for MathJax layout.
  const stage = /** @type {HTMLElement} */ (preview.cloneNode(false));
  stage.classList.remove('preview');
  stage.classList.add('file-editor-preview-stage');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.width = `${preview.getBoundingClientRect().width}px`;
  const stageRoot = stage.attachShadow({ mode: 'open' });
  stageRoot.adoptedStyleSheets = shadowRoot.adoptedStyleSheets;
  const content = document.createElement('div');
  content.innerHTML = DOMPurify.sanitize(
    contents.trim() ? contents : '<p>Begin typing above to preview</p>',
  );
  stageRoot.append(content);

  const math = Array.from(content.querySelectorAll('.pl-file-editor-math'), (node) => {
    // Ancestors can change MathJax processing (e.g. mathjax_ignore) or font/layout.
    let source = node.outerHTML;
    for (
      let parent = node.parentElement;
      parent && parent !== content;
      parent = parent.parentElement
    ) {
      source +=
        parent.tagName +
        JSON.stringify(Array.from(parent.attributes, (attr) => [attr.name, attr.value]));
    }
    return { source, node };
  });
  const otherContent = /** @type {HTMLDivElement} */ (content.cloneNode(true));
  otherContent.querySelectorAll('.pl-file-editor-math').forEach((node) => node.remove());
  /** @param {string} value */
  const hasMath = (value) => /\$|\\[()[\]]/.test(value);
  // Reuse only an unchanged, ordered math sequence. Changes to definitions,
  // labels or references can affect expressions elsewhere in the document.
  // Raw HTML/custom renderers can contain math outside our Markdown tokens.
  const reuseMath =
    request.type === 'markdown' &&
    !hasMath(otherContent.innerHTML) &&
    math.length === this.previewMath.length &&
    math.every((item, i) => item.source === this.previewMath[i].source);
  if (reuseMath) {
    // Leave placeholders here; moving the existing equations now would make
    // them disappear from the visible preview before we are ready to commit.
    math.forEach(({ node }) => node.replaceChildren());
  }

  // MathJax needs an attached, measurable container even though it is invisible.
  preview.after(stage);
  try {
    if (!reuseMath && hasMath(content.innerHTML)) {
      await MathJax.typesetPromise([content]);
    }
    await MathJax.whenReady(() => {
      // Typing may have superseded this render while MathJax was working.
      if (request.version !== this.previewVersion || this.previewDestroyed) return;
      // Move reusable equations and swap content synchronously so the browser
      // never paints an intermediate preview containing placeholders or raw TeX.
      const scrollTop = preview.scrollTop;
      if (reuseMath) {
        math.forEach((item, i) => {
          const existing = this.previewMath[i].node;
          item.node.replaceWith(existing);
          item.node = existing;
        });
      }
      // Move reused math out first so clearing outgoing content keeps its MathItems.
      MathJax.typesetClear(Array.from(shadowRoot.children));
      shadowRoot.replaceChildren(...content.childNodes);
      this.previewMath = math;
      preview.scrollTop = scrollTop;
    });
  } finally {
    // After a successful commit, content is empty because its children moved to
    // the visible preview. Otherwise, release the discarded/failed render's
    // MathItems before removing the stage so MathJax does not retain its nodes.
    await MathJax.whenReady(() => {
      MathJax.typesetClear([content]);
      stage.remove();
    });
  }
};

/**
 * Bind the settings modal controls for this editor.
 * @param {string} uuid
 * @returns {void}
 * @this {FileEditor}
 */
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
    sessionStorage.setItem('pl-file-editor-fontsize-current', String(this.editor.getFontSize()));
    const savedKeyboardHandler = localStorage.getItem('pl-file-editor-keyboardHandler');
    if (savedKeyboardHandler) {
      sessionStorage.setItem('pl-file-editor-keyboardHandler-current', savedKeyboardHandler);
    }

    this.modal.find('#modal-' + uuid + '-themes').change((e) => {
      const theme = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
      this.editor.setTheme(theme);
    });
    this.modal.find('#modal-' + uuid + '-fontsize').change((e) => {
      const fontSize = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
      this.editor.setFontSize(fontSize);
    });
  });

  this.saveSettingsButton.click(() => {
    const theme = /** @type {HTMLSelectElement} */ (
      this.modal.find('#modal-' + uuid + '-themes')[0]
    ).value;
    const fontsize = /** @type {HTMLSelectElement} */ (
      this.modal.find('#modal-' + uuid + '-fontsize')[0]
    ).value;
    const keyboardHandler = /** @type {HTMLSelectElement} */ (
      this.modal.find('#modal-' + uuid + '-keyboardHandler')[0]
    ).value;

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

/**
 * Bind the confirmation flow for restoring the original file.
 * @returns {void}
 * @this {FileEditor}
 */
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

/**
 * Replace the answer, optionally resetting undo history.
 * @param {string} contents
 * @param {{resetUndo?: boolean}} [options]
 * @returns {void}
 * @this {FileEditor}
 */
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

/**
 * Synchronize the submitted answer independently of preview scheduling.
 * @returns {void}
 * @this {FileEditor}
 */
window.PLFileEditor.prototype.syncFileToHiddenInput = function () {
  this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

/**
 * Decode a base64-encoded UTF-8 answer.
 * @param {string} str
 * @returns {string} Converted answer text.
 * @this {FileEditor}
 */
window.PLFileEditor.prototype.b64DecodeUnicode = function (str) {
  return new TextDecoder().decode(Uint8Array.from(atob(str), (c) => c.charCodeAt(0)));
};

/**
 * Encode a UTF-8 answer without exceeding the argument limit for large files.
 * @param {string} str
 * @returns {string} Converted answer text.
 * @this {FileEditor}
 */
window.PLFileEditor.prototype.b64EncodeUnicode = function (str) {
  const bytes = new TextEncoder().encode(str);
  let binaryString = '';
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binaryString += String.fromCodePoint(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binaryString);
};

/** @type {Record<string, PreviewRenderer | undefined>} */
window.PLFileEditor.prototype.preview = {
  html: (value) => value,
  markdown: (() => {
    /** @type {Promise<import('marked').Marked> | undefined} */
    let markedPromise;
    /**
     * @param {string} value
     * @returns {Promise<string>} Rendered preview HTML.
     */
    return async (value) => {
      markedPromise ??= (async () => {
        const { Marked } = await import('marked');
        const marked = new Marked();
        await MathJax.startup.promise;
        (await import('@prairielearn/marked-mathjax')).addMathjaxExtension(marked, MathJax);
        marked.use({
          extensions: [
            {
              name: 'math',
              renderer: ({ text }) => `<span class="pl-file-editor-math">${text}</span>`,
            },
          ],
        });
        return marked;
      })();
      return (await markedPromise).parse(value);
    };
  })(),
  dot: (() => {
    /** @type {Promise<import('@viz-js/viz').Viz> | null} */
    let vizPromise = null;
    /**
     * @param {string} value
     * @returns {Promise<string>} Rendered preview HTML.
     */
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
        return `<span class="text-danger">${err instanceof Error ? err.message : `${err}`}</span>`;
      }
    };
  })(),
  // Additional preview types can be created by extensions, by adding entries to window.PLFileEditor.prototype.preview.
};
