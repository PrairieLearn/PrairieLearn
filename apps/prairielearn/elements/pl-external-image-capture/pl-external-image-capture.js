/* global QRCode */

(() => {
    class PLExternalImageCapture {
        constructor(
            qr_code_url
        ) {
            this.qr_code_url = qr_code_url;

            const scanSubmissionButton = document.querySelector('#scan-submission-button');
            if (!scanSubmissionButton) {
                return;
            }

            scanSubmissionButton.addEventListener('inserted.bs.popover', () => {
                this.generateQrCode();
            })

            this.loadSubmission();

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

        async loadSubmission() {
            const submittedImageResponse = await fetch(
                `${this.qr_code_url}/submitted_image`,
            )
            
            if (!submittedImageResponse.ok) {
                if (submittedImageResponse.status === 404) {
                    // The user has not submitted an image yet.
                    return;
                }
                throw new Error('Failed to load submitted image');
            }
            const blob = await submittedImageResponse.blob();
            const previewImage = document.querySelector('#preview-image');

            previewImage.classList.remove('d-none');

            previewImage.src = URL.createObjectURL(blob);   
        }
    }

    window.PLExternalImageCapture = PLExternalImageCapture;
})();