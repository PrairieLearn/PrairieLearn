/* eslint-env browser,jquery */
/* global ace, showdown, MathJax, DOMPurify */
window.PLFileEditor = function (uuid, options) {
  var elementId = '#file-editor-' + uuid;
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
  this.editor = ace.edit(this.editorElement.get(0));
  this.editor.setTheme('ace/theme/chrome');
  this.editor.getSession().setUseWrapMode(true);
  this.editor.setShowPrintMargin(false);
  this.editor.setReadOnly(options.readOnly);
  this.editor.setOption("dragEnabled", false);
  this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

  this.session = this.editor.getSession();
  this.doc = this.session.getDocument();
  this.hasRanges = options.hasRanges;
  this.rangeList = [];
  

  let editor = this.editor,
      doc = this.doc;

function intersects(range) {
  var cursor = editor.selection.getCursor();
  var cursorRange = new ace.Range(cursor.row, cursor.column, cursor.row, cursor.column);
  return range.intersects(cursorRange);
}

const applyGutterStyles = () => {
  var lines = editor.session.getLength();
  for (var i = 0; i < lines; i++) {
    if (this.rangeList.some(range =>
      i >= range.start.row && i <= range.end.row
    )) {
      editor.session.addGutterDecoration(i, 'readonly-gutter');
    } else {
      editor.session.addGutterDecoration(i, 'editable-gutter');
    }
  }
}

const updateGutter = () => {
  editor.session.$decorations = [];
  setTimeout(() => {
    applyGutterStyles();
  }, 0);
}

editor.on("change", updateGutter);
editor.on("changeSelection", updateGutter);

applyGutterStyles();

if (this.hasRanges) {

  editor.commands.on("exec", function(e) { 
    var cursor = editor.selection.getCursor();
    
    var inRange = this.rangeList.some(intersects);
    
    let exceptions = ["gotoleft", "gotoright", "golineup", "golinedown", "gotolinestart", "gotolineend"]
    if (inRange && !exceptions.includes(e.command.name)) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    
    if (cursor.row === this.rangeList[0].end.row + 1 && cursor.column === 0 && e.command.name === "backspace" && editor.selection.isEmpty()) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    var isBeforeReadonlyRange = this.rangeList.some(range => {
      return (cursor.row === range.start.row && cursor.column === 0 && e.command.name === "del" && editor.selection.isEmpty()) ||
             (cursor.row === range.start.row - 1 && cursor.column === editor.session.getLine(cursor.row).length && e.command.name === "del" && editor.selection.isEmpty());
    });

    if (isBeforeReadonlyRange) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
  }.bind(this));

  let contentBeforeDrop;
  let cursorBeforeDrop;

  editor.container.addEventListener('dragover', function() {
      contentBeforeDrop = editor.getValue();
      cursorBeforeDrop = editor.getCursorPosition();
  }.bind(this));

  const isCursorBeforeOrInReadOnly = (range) => {
    var cursor = editor.selection.getCursor();

    var extendedRange = new ace.Range(
        range.start.row, range.start.column - 1,
        range.end.row, range.end.column
    );

    var cursorRange = new ace.Range(cursor.row, cursor.column, cursor.row, cursor.column);
    return extendedRange.intersects(cursorRange);
  }

  editor.container.addEventListener('drop', function(e) {
      var position = editor.renderer.screenToTextCoordinates(e.clientX, e.clientY);
      var cursorRange = new ace.Range(position.row, position.column, position.row, position.column);

      var inRange = this.rangeList.some(function(range) {
          return range.intersects(cursorRange);
      });

      var inExtendedRange = this.rangeList.some(isCursorBeforeOrInReadOnly);

      if (inRange || inExtendedRange) {
          setTimeout(function() {
              const contentAfterDrop = editor.getValue();
              const addedContentLength = contentAfterDrop.length - contentBeforeDrop.length;
              
              const linesAfterDrop = contentAfterDrop.split('\n');
              const linesBeforeDrop = contentBeforeDrop.split('\n');
              const addedLinesCount = linesAfterDrop.length - linesBeforeDrop.length;


              const startRemovingPosition = {
                  row: cursorBeforeDrop.row,
                  column: cursorBeforeDrop.column
              };

              let endRemovingPosition;
              if (addedLinesCount === 0) {  
                  endRemovingPosition = {
                      row: cursorBeforeDrop.row,
                      column: cursorBeforeDrop.column + addedContentLength
                  };
              } else {  
                  endRemovingPosition = {
                      row: cursorBeforeDrop.row + addedLinesCount,
                      column: linesAfterDrop[cursorBeforeDrop.row + addedLinesCount].length - (linesBeforeDrop[cursorBeforeDrop.row].length - cursorBeforeDrop.column)
                  };
              }

              editor.session.replace(new ace.Range(
                  startRemovingPosition.row, startRemovingPosition.column,
                  endRemovingPosition.row, endRemovingPosition.column
              ), '');

              editor.clearSelection();
          }, 0);
      }
  }.bind(this));
}

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

  if (!(options.hasRanges)) {
    this.editor.setKeyboardHandler(localStorage.getItem('pl-file-editor-keyboardHandler'));
  }

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

  var currentContents = '';
  if (options.currentContents) {
    currentContents = this.b64DecodeUnicode(options.currentContents);
  }
  this.setEditorContents(currentContents);

  this.syncSettings();

  this.initSettingsButton(uuid);

  this.initRestoreOriginalButton();

const addAnchor = (range) => {
    let anchor = new ace.Range();
    
    anchor.start = doc.createAnchor(range.start.row, range.start.column);
    anchor.end = doc.createAnchor(range.end.row, range.end.column);
    this.rangeList.push(anchor);     // Add the new range to the rangeList
  }

  if (this.hasRanges) {
    let ranges = options.ranges;
    this.nested_ranges = JSON.parse(ranges);

    this.nested_ranges.forEach(range => {
      const [startRow, endRow] = range;
      let anchor_range = new ace.Range(startRow, 0, endRow, Infinity);
      addAnchor(anchor_range);
    })
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
    if (this.hasRanges === false) {
      this.editor.setKeyboardHandler(localStorage.getItem('pl-file-editor-keyboardHandler'));

    }
  });
};

window.PLFileEditor.prototype.updatePreview = async function (preview_type) {
  const editor_value = this.editor.getValue();
  const default_preview_text = '<p>Begin typing above to preview</p>';
  const html_contents = editor_value
    ? (await Promise.resolve(this.preview[preview_type]?.(editor_value))) ??
      `<p>Unknown preview type: <code>${preview_type}</code></p>`
    : '';

  let preview = this.element.find('.preview')[0];
  if (html_contents.trim().length === 0) {
    preview.innerHTML = default_preview_text;
  } else {
    let sanitized_contents = DOMPurify.sanitize(html_contents, { SANITIZE_NAMED_PROPS: true });
    preview.innerHTML = sanitized_contents;
    if (
      sanitized_contents.includes('$') ||
      sanitized_contents.includes('\\(') ||
      sanitized_contents.includes('\\)') ||
      sanitized_contents.includes('\\[') ||
      sanitized_contents.includes('\\]')
    ) {
      MathJax.typesetPromise();
    }
  }
};

window.PLFileEditor.prototype.initSettingsButton = function (uuid) {
  this.settingsButton.click(() => {
    ace.require(['ace/ext/themelist'], (themeList) => {
      var themeSelect = this.modal.find('#modal-' + uuid + '-themes');
      themeSelect.empty();
      for (const entries in themeList.themesByName) {
        var caption = themeList.themesByName[entries].caption;
        var theme = themeList.themesByName[entries].theme;

        themeSelect.append(
          $('<option>', {
            value: theme,
            text: caption,
            selected: localStorage.getItem('pl-file-editor-theme') === theme,
          }),
        );
      }

      var fontSizeList = ['12px', '14px', '16px', '18px', '20px', '22px', '24px'];
      var fontSelect = this.modal.find('#modal-' + uuid + '-fontsize');
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

      var keyboardHandlerList = ['Default', 'Vim', 'Emacs', 'Sublime', 'VSCode'];
      var keyboardHandlerSelect = this.modal.find('#modal-' + uuid + '-keyboardHandler');
      keyboardHandlerSelect.empty();
      for (const index in keyboardHandlerList) {
        var keyboardHandler = 'ace/keyboard/' + keyboardHandlerList[index].toLowerCase();

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
      var theme = $(e.currentTarget).val();
      this.editor.setTheme(theme);
    });
    this.modal.find('#modal-' + uuid + '-fontsize').change((e) => {
      var fontSize = $(e.currentTarget).val();
      this.editor.setFontSize(fontSize);
    });
  });

  this.saveSettingsButton.click(() => {
    var theme = this.modal.find('#modal-' + uuid + '-themes').val();
    var fontsize = this.modal.find('#modal-' + uuid + '-fontsize').val();
    var keyboardHandler = this.modal.find('#modal-' + uuid + '-keyboardHandler').val();

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
  });

  this.restoreOriginalConfirm.click(() => {
    this.restoreOriginalConfirmContainer.hide();
    this.restoreOriginalButton.show();
    this.setEditorContents(this.b64DecodeUnicode(this.originalContents));
    this.setAnchors();
  });

  this.restoreOriginalCancel.click(() => {
    this.restoreOriginalConfirmContainer.hide();
    this.restoreOriginalButton.show();
  });
};

window.PLFileEditor.prototype.setAnchors = function () {
  let doc = this.session.getDocument(); 

  let newRangeList = [];

  function addAnchor(range) {
    let anchor = new ace.Range();
    
    anchor.start = doc.createAnchor(range.start.row, range.start.column);
    anchor.end = doc.createAnchor(range.end.row, range.end.column);
    newRangeList.push(anchor);
  }

  this.nested_ranges.forEach(range => {
    const [startRow, endRow] = range;
    let anchor_range = new ace.Range(startRow, 0, endRow, Infinity);
    addAnchor(anchor_range);
  })
  this.rangeList = newRangeList;
  
};
window.PLFileEditor.prototype.setEditorContents = function (contents) {
  this.editor.setValue(contents);
  this.editor.session.getUndoManager().reset();
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
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
      return String.fromCharCode('0x' + p1);
    }),
  );
};

window.PLFileEditor.prototype.preview = {
  html: (value) => value,
  markdown: (() => {
    let markdownRenderer = new showdown.Converter({
      literalMidWordUnderscores: true,
      literalMidWordAsterisks: true,
    });

    return async (value) => markdownRenderer.makeHtml(value);
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
