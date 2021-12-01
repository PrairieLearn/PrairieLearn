const jsCrc = require('js-crc');

/**
 * Creaters a barcode from a number. Number can only be used once.
 * @param {Number} seed An integer to create the barcode from
 */
const createBarcode = (seed) => {
  const base36 = BigInt(seed).toString(36);
  const crc16 = jsCrc.crc16(base36);
  return`${base36}${crc16}`.toUpperCase(); // concat as string in chance integer combo
};

const getBarcodeSegments = (barcode) => {
  barcode = barcode.toLowerCase();
  const sha16 = barcode.substring(barcode.length - 4, barcode.length);
  return {
    fullBarcode: barcode,
    sha16,
    base36: barcode.replace(sha16, ''),
  };
};

const isValid = (barcode) => {
  const { base36, sha16 } = getBarcodeSegments(barcode);
  const recomputedSha16 = jsCrc.crc16(base36);
  return recomputedSha16 === sha16;
}

module.exports = {createBarcode, getBarcodeSegments, isValid};
