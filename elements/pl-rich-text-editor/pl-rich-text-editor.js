/* eslint-env browser,jquery */
/* global Quill,he */

window.PLRTE = function (uuid, options) {
  if (!options.modules) options.modules = {};
  if (options.readOnly) options.modules.toolbar = false;
  else
    options.modules.toolbar = [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block', { script: 'sub' }, { script: 'super' }],
      [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
      [{ size: ['small', false, 'large'] }],
      [{ header: [1, 2, 3, false] }],
      [{ color: [] }, { background: [] }],
      ['clean'],
    ];

  let inputElement = $('#rte-input-' + uuid);
  let quill = new Quill('#rte-' + uuid, options);

  let contents = atob(inputElement.val());
  quill.setContents(quill.clipboard.convert(contents));

  quill.on('text-change', function (_delta, _oldDelta, _source) {
    inputElement.val(
      btoa(
        he.encode(quill.root.innerHTML, {
          allowUnsafeSymbols: true, // HTML tags should be kept
          useNamedReferences: true,
        })
      )
    );
  });
};
