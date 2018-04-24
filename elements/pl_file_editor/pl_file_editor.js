/* eslint-env browser,jquery */
/* global ace */
window.PLFileEditor = function(uuid, options) {
    var elementId = '#file-editor-' + uuid;
    this.element = $(elementId);
    if (!this.element) {
        throw new Error('File upload element ' + elementId + ' was not found!');
    }
    this.originalContents = options.originalContents || '';

    this.inputElement = this.element.find('input');
    this.editorElement = this.element.find('.editor');
    this.restoreOriginalButton = this.element.find('.restore-original');
    this.restoreOriginalConfirmContainer = this.element.find('.restore-original-confirm-container');
    this.restoreOriginalConfirm = this.element.find('.restore-original-confirm');
    this.restoreOriginalCancel = this.element.find('.restore-original-cancel');
    this.editor = ace.edit(this.editorElement.get(0));
    this.editor.setTheme('ace/theme/chrome');
    this.editor.getSession().setUseWrapMode(true);
    this.editor.setShowPrintMargin(false);
    this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

    if (options.aceMode) {
        this.editor.getSession().setMode(options.aceMode);
    }

    if (options.aceTheme) {
        this.editor.setTheme(options.aceTheme);
    } else {
        this.editor.setTheme('ace/theme/chrome');
    }

    var currentContents = '';
    if (options.currentContents) {
        currentContents = this.b64DecodeUnicode(options.currentContents);
    }
    this.setEditorContents(currentContents);

    this.initRestoreOriginalButton();
};

window.PLFileEditor.prototype.initRestoreOriginalButton = function() {
    var that = this;
    this.restoreOriginalButton.click(function() {
        that.restoreOriginalButton.hide();
        that.restoreOriginalConfirmContainer.show();
    });

    this.restoreOriginalConfirm.click(function() {
        that.restoreOriginalConfirmContainer.hide();
        that.restoreOriginalButton.show();
        that.setEditorContents(that.b64DecodeUnicode(that.originalContents));
    });

    this.restoreOriginalCancel.click(function() {
        that.restoreOriginalConfirmContainer.hide();
        that.restoreOriginalButton.show();
    });
};

window.PLFileEditor.prototype.setEditorContents = function(contents) {
    this.editor.setValue(contents);
    this.editor.gotoLine(1, 0);
    this.editor.focus();
    this.syncFileToHiddenInput();
};

window.PLFileEditor.prototype.syncFileToHiddenInput = function() {
    this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

window.PLFileEditor.prototype.b64DecodeUnicode = function(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
};

window.PLFileEditor.prototype.b64EncodeUnicode = function(str) {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
};
