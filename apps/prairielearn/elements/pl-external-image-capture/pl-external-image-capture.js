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
            const reloadButton = document.querySelector('#reload-submission-button');
            const captureWithWebcamButton = document.querySelector('#capture-with-webcam-button');
            const captureImageButton = document.querySelector('#capture-image-button');
            const cancelWebcamButton = document.querySelector('#cancel-webcam-button');
            const retakeImageButton = document.querySelector('#retake-image-button');
            // const confirmImageButton = document.querySelector('#confirm-image-button');

            if (!scanSubmissionButton || !reloadButton || !captureWithWebcamButton || !captureImageButton || !cancelWebcamButton || !retakeImageButton) {
                return;
            }

            scanSubmissionButton.addEventListener('inserted.bs.popover', () => {
                this.generateQrCode();
            })

            reloadButton.addEventListener('click', () => {
                this.loadSubmission();
            });

            captureWithWebcamButton.addEventListener('click', () => {
                this.startWebcamCapture();
            });

            captureImageButton.addEventListener('click', (event) => {
                event.preventDefault();
                this.handleCaptureImage();
            });

            cancelWebcamButton.addEventListener('click', (event) => {
                event.preventDefault();
                this.cancelWebcamCapture();
            });

            retakeImageButton.addEventListener('click', (event) => {
                event.preventDefault();
                this.cancelWebcamCapture();
                this.startWebcamCapture();
            });

            // confirmImageButton.addEventListener('click', (event) => {
            //     event.preventDefault();
            //     this.confirmWebcamCapture();
            // })

            this.loadSubmission();
            this.listenForSubmission();
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
            const questionContainer = document.querySelector('.question-container');

            if (!questionContainer) return;

            const socket = io('/external-image-capture');

            socket.emit('joinExternalImageCapture', {
                variant_id: this.variant_id,
                variant_token: questionContainer.dataset.variantToken,
                answer_name: this.answer_name,
            }, ((msg) => {
                if (!msg) {
                    console.error('Failed to join external image capture socket');
                    return;
                }
                if (msg.image_uploaded) {
                    this.loadSubmission();
                }
            }));

            socket.on('imageUploaded', (msg) => {
                console.log('Submission changed, reloading...');
                if (msg.image_uploaded) {
                    this.loadSubmission();
                }
            });
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
                    class="bg-body-secondary d-flex justify-content-center align-items-center rounded border w-100"
                    style="height: 200px;"
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
                    style="width: 50%;"
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

        async startWebcamCapture() {
            const externalImageCaptureContainer = document.querySelector('#external-image-capture-container');
            const webcamCaptureContainer = document.querySelector('#webcam-capture-container'); 
            const permissionMessage = document.querySelector('#webcam-permission-message');

            const webcamConfirmationContainer = document.querySelector('#webcam-confirmation-container');

            if (!externalImageCaptureContainer || !webcamCaptureContainer || !webcamConfirmationContainer) {
                console.error('External image capture or webcam capture container not found');
                return;
            }

            externalImageCaptureContainer.classList.add('d-none');

            webcamCaptureContainer.classList.remove('d-none');
            webcamCaptureContainer.classList.add('d-flex');

            webcamConfirmationContainer.classList.add('d-none');

            try {
                this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const video = document.getElementById('webcam-video');
                video.srcObject = this.webcamStream;
                await video.play();
                permissionMessage.classList.add('d-none');
                const captureImageButton = document.querySelector('#capture-image-button');

                if (captureImageButton) {
                    captureImageButton.removeAttribute('disabled');
                }
            } catch (err) {
                console.error('Could not start webcam:', err);
            }
        }

        deactivateVideoStream() {
            const video = document.getElementById('webcam-video');
            if (this.webcamStream) {
                this.webcamStream.getTracks().forEach(track => track.stop());
                this.webcamStream = null;
            }
            video.srcObject = null;
            video.pause();


            const captureImageButton = document.querySelector('#capture-image-button');
            if (captureImageButton) {
                captureImageButton.setAttribute('disabled', 'disabled');
            }
        }

        async handleCaptureImage() {
            const webcamCaptureContainer = document.querySelector('#webcam-capture-container');
            const webcamConfirmationContainer = document.querySelector('#webcam-confirmation-container');
            const webcamImagePreviewCanvas = document.querySelector('#webcam-image-preview');
            const webcamVideo = webcamCaptureContainer.querySelector('#webcam-video');

            if (!webcamCaptureContainer || !webcamConfirmationContainer || !webcamImagePreviewCanvas || !webcamVideo) {
                console.error('Webcam capture or confirmation container not found');
                return;
            }

            webcamImagePreviewCanvas.width = webcamVideo.videoWidth;
            webcamImagePreviewCanvas.height = webcamVideo.videoHeight;
            webcamImagePreviewCanvas.getContext('2d').drawImage(webcamVideo, 0, 0, webcamVideo.videoWidth, webcamVideo.videoHeight);
            
            webcamCaptureContainer.classList.add('d-none');
            webcamCaptureContainer.classList.remove('d-flex');
            webcamConfirmationContainer.classList.remove('d-none');
            webcamConfirmationContainer.classList.add('d-flex');

            this.deactivateVideoStream();
        }

        async confirmWebcamCapture() {
            const canvas = document.querySelector('#webcam-image-preview');
            if (!canvas) {
                console.error('Webcam image preview canvas not found');
                return;
            }

            const questionContainer = document.querySelector('.question-container');

            if (!questionContainer) return;

            const blob = await new Promise(resolve =>
                canvas.toBlob(resolve, 'image/png')
            );
            if (!blob) {
                console.error('Failed to convert canvas to blob');
                return;
            }

            

            // const file = new File([blob], 'external-image-capture.png', { type: 'image/png' });

            // Obtain a CSRF token
            // let csrfToken;
            // try {
            //     const res = await fetch(`${this.qr_code_url}/csrf-token`, {
            //         method: 'GET',
            //     });
            //     if (!res.ok) throw new Error(`HTTP ${res.status}`);
            //     // Extract CSRF token from the response
            //     console.log('Response headers:', res.headers);

            // } catch (err) {
            //     console.error('Failed to obtain CSRF token:', err);
            //     return;
            // }


            // const formData = new FormData();
            // formData.append('__csrf_token', questionContainer.dataset.csrfToken);
            // formData.append('file', file);    

            // try {
            //     const res = await fetch(`${this.qr_code_url}`, {
            //         method: 'POST',
            //         headers: {
            //             'x-csrf-token': questionContainer.dataset.csrfToken
            //         },
            //         body: formData
            //     });
            //     if (!res.ok) throw new Error(`HTTP ${res.status}`);
            //     this.closeConfirmationContainer();
            // } catch (err) {
            //     console.error('Failed to submit image:', err);
            // }
        }

        closeConfirmationContainer() {
            const externalImageCaptureContainer = document.querySelector('#external-image-capture-container');
            const webcamConfirmationContainer = document.querySelector('#webcam-confirmation-container');
            if (!externalImageCaptureContainer || !webcamConfirmationContainer) {
                console.error('Webcam capture or confirmation container not found');
                return;
            }

            externalImageCaptureContainer.classList.remove('d-none');
            externalImageCaptureContainer.classList.add('d-flex');
            webcamConfirmationContainer.classList.add('d-none');
            webcamConfirmationContainer.classList.remove('d-flex');
        }
        
        cancelWebcamCapture() {
            const externalImageCaptureContainer = document.querySelector('#external-image-capture-container');
            const webcamCaptureContainer = document.querySelector('#webcam-capture-container'); 
            const permissionMessage = document.querySelector('#webcam-permission-message');

            if (!externalImageCaptureContainer || !webcamCaptureContainer) {
                console.error('External image capture or webcam capture container not found');
                return;
            }

            externalImageCaptureContainer.classList.remove('d-none');

            webcamCaptureContainer.classList.add('d-none');
            webcamCaptureContainer.classList.remove('d-flex');

            permissionMessage.classList.remove('d-none');
            
            this.deactivateVideoStream();
        }
    }

    window.PLExternalImageCapture = PLExternalImageCapture;
})();