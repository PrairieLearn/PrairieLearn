/* global QRCode */

(() => {
    class PLExternalImageCapture {
        constructor(
            qr_code_url
        ) {
            console.log('qr_code_url', qr_code_url);
            this.qr_code_url = qr_code_url;

            const scanSubmissionButton = document.querySelector('#scan-submission-button');
            if (!scanSubmissionButton) {
                return;
            }

            scanSubmissionButton.addEventListener('inserted.bs.popover', () => {
                this.generateQrCode();
            })
        }

        generateQrCode() {
            const qrCodeSvg = new QRCode({ content: this.qr_code_url, container: 'svg-viewbox' }).svg();

            const qrCode = document.querySelector('#qr-code');
            if (qrCode) {
                qrCode.innerHTML = qrCodeSvg;
            } else {
                console.error('QR code element not found');
            }
        }
    }

    window.PLExternalImageCapture = PLExternalImageCapture;
})();