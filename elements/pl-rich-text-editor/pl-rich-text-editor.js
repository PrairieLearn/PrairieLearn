/* eslint-env browser,jquery */
/* global quill */

window.PLRTE = function(uuid, options) {

    if (options.readOnly) {
        if (!options.modules)
            options.modules = { };
        options.modules.toolbar = false;
    }
    
    let inputElement = $('#rte-input-' + uuid);
    let quill = new Quill('#rte-' + uuid, options);

    let contents = atob(inputElement.val());
    quill.clipboard.dangerouslyPasteHTML(contents);
    
    quill.on('text-change', function(delta, oldDelta, source) {
        inputElement.val(btoa(unescape(encodeURIComponent(quill.root.innerHTML))));
    });
};
