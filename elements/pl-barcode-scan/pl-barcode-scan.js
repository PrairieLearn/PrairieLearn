/* eslint-env browser,jquery */

$(() => {
  const barcode = $('#pl-barcode-scan-input');
  const showBadge = (selector) => {
    $(selector).css('display', 'inline-block');
  };
  const hideBadge = (selector) => {
    $(selector).css('display', 'none');
  };
  const toggleInvalidBarcode = (barcode, base36, checksum) => {
    if (barcode.val().length === 0 || window.crc16(base36) === checksum) {
      hideBadge('#pl-barcode-scan-invalid');
    } else {
      showBadge('#pl-barcode-scan-invalid');
    }
  };
  const toggleBarcodeRequired = (barcode) => {
    const barcodeRequired = $('#pl-barcode-scan-required');
    if (barcodeRequired && barcode.val().length === 0) {
      console.log('showing 1');
      showBadge('#pl-barcode-scan-required');
    } else {
      console.log('hiding 1');
      hideBadge('#pl-barcode-scan-required');
    }
  };
  const toggleValidBarcode = (barcode, base36, checksum) => {
    if (window.crc16(base36) === checksum) {
      showBadge('#pl-barcode-scan-valid');
    } else {
      hideBadge('#pl-barcode-scan-valid');
    }
  };

  // listener
  barcode.on('keyup', () => {
    console.log('run...');
    const sanitized = barcode.val().toLowerCase().trim();
    const checksum = sanitized.substring(sanitized.length - 4, sanitized.length);
    const base36 = sanitized.replace(checksum, '');

    toggleBarcodeRequired(barcode);
    toggleInvalidBarcode(barcode, base36, checksum);
    toggleValidBarcode(barcode, base36, checksum);
  });
});
