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
  this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

  this.session = this.editor.getSession();
  this.doc = this.session.getDocument();
  this.hasRanges = options.hasRanges;
  this.rangeList = [];
  

  let editor = this.editor,
      doc = this.doc;

function before(obj, method, wrapper) {
  var orig = obj[method];
  obj[method] = function() {
    var args = Array.prototype.slice.call(arguments);
    return wrapper.call(this, function(){
      return orig.apply(obj, args);
    }, args);
  }

  return obj[method];
}

function intersects(range) {
  var cursor = editor.selection.getCursor();
  return (
    cursor.row >= range.start.row && cursor.row <= range.end.row &&
    cursor.column >= range.start.column && cursor.column <= range.end.column
  );
}

const preventReadonly = (next) => {
  if (this.rangeList.ranges.some(intersects)) return;
  next();
}
before(editor, 'onPaste', preventReadonly);
before(editor, 'onCut',   preventReadonly);

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
    editor.keyBinding.addKeyboardHandler({
      handleKeyboard: (data, hash, keyString, keyCode, event) => {
        if (hash === -1 || (keyCode <= 40 && keyCode >= 37)) return false;
        if (this.rangeList.some(range => intersects(range))) {
          return { command: "null", passEvent: false };
        }
  
        var cursor = editor.selection.getCursor();
        var inRange = this.rangeList.some(range =>
          cursor.row >= range.start.row && cursor.row <= range.end.row
        );
    
        if (inRange) {
          return { command: "null", passEvent: false };
        }
    
        if (cursor.row === this.rangeList[0].end.row + 1 && cursor.column === 0 && keyCode === 8 && editor.selection.isEmpty()) {
          event.preventDefault();
          return { command: "null", passEvent: false };
        }s
    
        return null;
      }
    });
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

  if (options.preview === 'markdown') {
    let renderer = new showdown.Converter({
      literalMidWordUnderscores: true,
      literalMidWordAsterisks: true,
    });

    this.editor.session.on('change', () => {
      this.updatePreview(renderer.makeHtml(this.editor.getValue()));
    });
    this.updatePreview(renderer.makeHtml(this.editor.getValue()));
  } else if (options.preview === 'html') {
    this.editor.session.on('change', () => {
      this.updatePreview(this.editor.getValue());
    });
    this.updatePreview(this.editor.getValue());
  } else if (options.preview !== undefined) {
    let preview = this.element.find('.preview')[0];
    preview.innerHTML = '<p>Unknown preview type: <code>' + options.preview + '</code></p>';
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

window.PLFileEditor.prototype.updatePreview = function (html_contents) {
  const default_preview_text = '<p>Begin typing above to preview</p>';
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

    if (!this.hasRanges) {
      this.editor.setKeyboardHandler(localStorage.getItem('pl-file-editor-keyboardHandler'));
    }

    window.dispatchEvent(new Event('pl-file-editor-settings-changed'));
    this.modal.modal('hide');
  });

  this.closeSettingsButton.click(() => {
    this.editor.setTheme(sessionStorage.getItem('pl-file-editor-theme-current'));
    this.editor.setFontSize(sessionStorage.getItem('pl-file-editor-fontsize-current'));
    if (!this.hasRanges) {
      this.editor.setKeyboardHandler(
        sessionStorage.getItem('pl-file-editor-keyboardHandler-current'),
      );
    }
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
