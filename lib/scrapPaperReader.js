const config = require('./config');
const path = require('path');
const fs = require('fs').promises;
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); // legacy means node support

/**
 * Load metadata about pdf
 * https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.js
 * @param {Buffer} pdfBuffer
 * @returns {object} pdf.js wrapper
 */
const readPdf = async (pdfBuffer, originalFilename) => {
  const pdfPath = path.join(config.imageProcessingDir, originalFilename);
  await fs.mkdir(config.imageProcessingDir, { recursive: true });
  await fs.writeFile(pdfPath, pdfBuffer);
  const doc = await pdfjsLib.getDocument(pdfPath).promise;
  await fs.unlink(pdfPath);
  return doc;
};

module.exports = { readPdf };
