/* eslint-env browser,jquery */
/* global _, ace */
window.PLFileEditor = function(uuid, options) {
    this.element = $('#file-editor-' + uuid);
    this.inputElement = this.element.find('input');
    this.editorElement = this.element.find('.editor');
    this.editor = ace.edit(this.editorElement.get(0));
    this.editor.setTheme('ace/theme/chrome');
    this.editor.getSession().setUseWrapMode(true);
    this.editor.setShowPrintMargin(false);
    this.editor.getSession().on('change', this.syncFileToHiddenInput.bind(this));

    if (options.aceMode) {
        this.editor.getSession().setMode(options.aceMode);
    }

    if (options.editorConfigFunction) {
        var configFn = _.get(window, options.editorConfigFunction);
        if (configFn) {
            try {
                configFn(this.editor);
            } catch (e) {
                window.console.error('Error executing editor config function ' + options.editorConfigFunction);
                window.console.error(e);
            }
        }
    }

    var currentContents = '';
    if (options.currentContents) {
        currentContents = this.b64DecodeUnicode(options.currentContents);
    }
    this.editor.setValue(currentContents);
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
