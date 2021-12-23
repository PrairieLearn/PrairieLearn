const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); // legacy means node support

/**
 * Load metadata about pdf
 * https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.js
 * @param {Buffer} pdfBuffer
 * @returns {object} pdf.js wrapper
 */
const readPdf = async (pdfBuffer) => {
  return pdfjsLib.getDocument(pdfBuffer).promise;
};

module.exports = { readPdf };
