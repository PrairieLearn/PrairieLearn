import { observe } from 'selector-observer';

// Safari does not fire load for PDF objects. Keep the URL usable until removal,
// including while a preview is collapsed or moved within the document.
observe('object.js-file-preview-pdf', {
  constructor: HTMLObjectElement,
  remove(pdf) {
    if (!pdf.isConnected) URL.revokeObjectURL(pdf.data);
  },
});
