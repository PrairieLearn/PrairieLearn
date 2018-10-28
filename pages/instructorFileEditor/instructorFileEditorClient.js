/* eslint-env browser,jquery */
/* global ace */
window.InstructorFileEditor = (uuid, options) => {
    const elementId = '#file-editor-' + uuid;
    this.element = $(elementId);
    if (!this.element) {
        throw new Error('Instructor file editor element ' + elementId + ' was not found!');
    }

    this.inputElement = this.element.find('input[name=file_edit_contents]');
    this.editorElement = this.element.find('.editor');
    this.editor = ace.edit(this.editorElement.get(0));
    this.editor.setTheme('ace/theme/chrome');
    this.editor.getSession().setUseWrapMode(true);
    this.editor.setShowPrintMargin(false);
    this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

    if (options.aceMode) {
        this.editor.getSession().setMode(options.aceMode);
    }

    // The following line is to avoid this warning in the console:
    //
    // Automatically scrolling cursor into view after selection change
    // this will be disabled in the next version
    // set editor.$blockScrolling = Infinity to disable this message
    //
    this.editor.$blockScrolling = Infinity;

    if (options.aceTheme) {
        this.editor.setTheme(options.aceTheme);
    } else {
        this.editor.setTheme('ace/theme/chrome');
    }

    let contents = '';
    if (options.contents) {
        contents = this.b64DecodeUnicode(options.contents);
    }
    this.setEditorContents(contents);
};

window.InstructorFileEditor.prototype.setEditorContents = (contents) => {
    this.editor.setValue(contents);
    this.editor.gotoLine(1, 0);
    this.editor.focus();
    this.syncFileToHiddenInput();
};

window.InstructorFileEditor.prototype.syncFileToHiddenInput = () => {
    this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

window.InstructorFileEditor.prototype.b64DecodeUnicode = (str) => {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
};

window.InstructorFileEditor.prototype.b64EncodeUnicode = (str) => {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
    }));
};
