/* global QRCode, io */

(() => {
    class PLExternalImageCapture {
        constructor(
            qr_code_url,
            course_id,
            course_instance_id,
            question_id,
            instance_question_id,
            variant_id,
            answer_name
        ) {
            this.qr_code_url = qr_code_url;
            this.course_id = course_id;
            this.course_instance_id = course_instance_id;
            this.question_id = question_id;
            this.instance_question_id = instance_question_id;
            this.variant_id = variant_id;
            this.answer_name = answer_name;

            const scanSubmissionButton = document.querySelector('#scan-submission-button');
            if (!scanSubmissionButton) {
                return;
            }

            scanSubmissionButton.addEventListener('inserted.bs.popover', () => {
                this.generateQrCode();
            })

            this.loadSubmission();

            const reloadButton = document.querySelector('#reload-submission-button');

            if (reloadButton) {
                reloadButton.addEventListener('click', () => {
                    this.loadSubmission();
                });
            }            
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

        listenForSubmission() {
            const socket = io('/submission', {
                course_id: this.course_id,
                course_instance_id: this.course_instance_id,
                question_id: this.question_id,
                instance_question_id: this.instance_question_id,
                variant_id: this.variant_id,
                answer_name: this.answer_name
            });

            socket.on('init', (msg, callback) => {

            })

            socket.on('change:submission', () => {
                this.loadSubmission();
            })            
        }

        async loadSubmission() {

            const uploadedImageContainer = document.querySelector('#uploaded-image-container');

            if (!uploadedImageContainer) {
                console.error('Uploaded image container not found');
                return;
            }
            
            const reloadButton = document.querySelector('#reload-submission-button');
            reloadButton.setAttribute('disabled', 'disabled');
            
            uploadedImageContainer.innerHTML = `
                <div
                    id="image-placeholder"
                    class="bg-body-secondary d-flex justify-content-center align-items-center rounded border"
                    style="width: 300px; height: 200px;"
                >
                    <div class="spinning-wheel spinner-border">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;

            const submittedImageResponse = await fetch(
                `${this.qr_code_url}/submitted_image`,
            )
            
            if (!submittedImageResponse.ok) {
                reloadButton.removeAttribute('disabled');
                if (submittedImageResponse.status === 404) {
                    const imagePlaceholderDiv = uploadedImageContainer.querySelector('#image-placeholder');
                    imagePlaceholderDiv.innerHTML = `
                        <span class="text-muted small">No image submitted yet.</span>
                    `
                    return;
                }
                throw new Error('Failed to load submitted image');
            }
            
            const { data, type } = await submittedImageResponse.json();            

            uploadedImageContainer.innerHTML = `
                <img
                    id="preview-image"
                    class="img-fluid rounded border border-secondary mb-1 d-none"
                    style="max-height: 300px;"
                />
            `;

            const previewImage = uploadedImageContainer.querySelector('#preview-image');
            
            previewImage.classList.remove('d-none');
            // previewImage.src = URL.createObjectURL(blob);   

            const b64_data = `data:${type};base64,${data}`;

            previewImage.src = `data:${type};base64,${data}`;

            const hiddenSubmissionInput = document.querySelector('#hidden-submission-input');
            hiddenSubmissionInput.value = b64_data;

            reloadButton.removeAttribute('disabled');
        }
    }

    window.PLExternalImageCapture = PLExternalImageCapture;
})();