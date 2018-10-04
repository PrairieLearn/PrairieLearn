/* eslint-env browser,jquery */
/* global ace */
window.InstructorFileEditor = function(uuid, options) {
    var elementId = '#file-editor-' + uuid;
    this.element = $(elementId);
    if (!this.element) {
        throw new Error('Instructor file editor element ' + elementId + ' was not found!');
    }

    this.inputElement = this.element.find('hidden-input-' + uuid);
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

    this.editor.$blockScrolling = Infinity;

    if (options.aceTheme) {
        this.editor.setTheme(options.aceTheme);
    } else {
        this.editor.setTheme('ace/theme/chrome');
    }

    var contents = '';
    if (options.contents) {
        contents = this.b64DecodeUnicode(options.contents);
    }
    this.setEditorContents(contents);

    this.initRestoreOriginalButton();
};

window.InstructorFileEditor.prototype.initRestoreOriginalButton = function() {
    var that = this;
    this.restoreOriginalButton.click(function() {
        that.restoreOriginalButton.hide();
        that.restoreOriginalConfirmContainer.show();
    });

    this.restoreOriginalConfirm.click(function() {
        that.restoreOriginalConfirmContainer.hide();
        that.restoreOriginalButton.show();

        // FIXME: do page reload... maybe by "POST"?
        // that.setEditorContents(that.b64DecodeUnicode(that.originalContents));
    });

    this.restoreOriginalCancel.click(function() {
        that.restoreOriginalConfirmContainer.hide();
        that.restoreOriginalButton.show();
    });
};

window.InstructorFileEditor.prototype.setEditorContents = function(contents) {
    this.editor.setValue(contents);
    this.editor.gotoLine(1, 0);
    this.editor.focus();
    this.syncFileToHiddenInput();
};

window.InstructorFileEditor.prototype.syncFileToHiddenInput = function() {
    this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

window.InstructorFileEditor.prototype.b64DecodeUnicode = function(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
};

window.InstructorFileEditor.prototype.b64EncodeUnicode = function(str) {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
};
