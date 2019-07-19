/* eslint-env browser,jquery */
/* global ace */
/* global CryptoJS */
window.InstructorFileEditor = function(options) {
    this.element = $(`#${options.elementId}`);
    if (!this.element) {
        throw new Error(`Instructor file editor element ${options.elementId} was not found!`);
    }

    this.origHash = options.origHash;
    this.saveElement = $(`#${options.saveElementId}`);
    this.inputElement = this.element.find('input[name=file_edit_contents]');
    this.editorElement = this.element.find('.editor');
    this.editor = ace.edit(this.editorElement.get(0), {
        minLines: 10,
        maxLines: Infinity,
        autoScrollEditorIntoView: true,
        wrap: true,
        showPrintMargin: false,
        mode: options.aceMode,
        readOnly: options.readOnly,
    });

    if (options.altElementId) {
        this.editor.setReadOnly(true);
        this.altElement = $(`#${options.altElementId}`);
        this.chooseElement = this.element.find('button[id=choose]');
        this.chooseContainerElement = this.element.find('.card-header');
        this.chooseElement.click(function() {
            this.editor.setReadOnly(false);
            this.altElement.remove();
            this.chooseContainerElement.remove();
            this.checkDiff();
            this.editor.resize();
        }.bind(this));
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

    this.originalContents = '';
    if (options.contents) {
        this.originalContents = this.b64DecodeUnicode(options.contents);
    }
    this.setEditorContents(this.originalContents);

    this.editor.getSession().on('change', this.onChange.bind(this));
};

window.InstructorFileEditor.prototype.setEditorContents = function(contents) {
    // use session.setValue to reset the undo stack as well
    this.editor.getSession().setValue(contents);
    this.editor.gotoLine(1, 0);
    this.editor.focus();
    this.syncFileToHiddenInput();
};

window.InstructorFileEditor.prototype.syncFileToHiddenInput = function() {
    this.inputElement.val(this.b64EncodeUnicode(this.editor.getValue()));
};

window.InstructorFileEditor.prototype.b64DecodeUnicode = function(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
};

window.InstructorFileEditor.prototype.b64EncodeUnicode = function(str) {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
    }));
};

window.InstructorFileEditor.prototype.onChange = function() {
    this.syncFileToHiddenInput();
    this.checkDiff();
};

window.InstructorFileEditor.prototype.checkDiff = function() {
    let curHash = this.b64EncodeUnicode(CryptoJS.SHA256(this.b64EncodeUnicode(this.editor.getValue())).toString());
    this.saveElement.prop('disabled', (curHash == this.origHash));
};
