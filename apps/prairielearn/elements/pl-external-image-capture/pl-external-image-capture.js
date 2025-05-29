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
            answer_name,
            submitted_file_name,
            submission_date
        ) {
            this.qr_code_url = qr_code_url;
            this.course_id = course_id;
            this.course_instance_id = course_instance_id;
            this.question_id = question_id;
            this.instance_question_id = instance_question_id;
            this.variant_id = variant_id;
            this.answer_name = answer_name;
            this.submitted_file_name = submitted_file_name;
            this.submission_date = submission_date;
            const scanSubmissionButton = document.querySelector('#scan-submission-button');
            const reloadButton = document.querySelector('#reload-submission-button');
            const captureWithWebcamButton = document.querySelector('#capture-with-webcam-button');
            const captureImageButton = document.querySelector('#capture-image-button');
            const cancelWebcamButton = document.querySelector('#cancel-webcam-button');
            const retakeImageButton = document.querySelector('#retake-image-button');
            const confirmImageButton = document.querySelector('#confirm-image-button');

            if (!scanSubmissionButton || !reloadButton || !captureWithWebcamButton || !captureImageButton || !cancelWebcamButton || !retakeImageButton || !confirmImageButton) {
                return;
            }

            scanSubmissionButton.addEventListener('inserted.bs.popover', () => {
                this.generateQrCode();
            })

            reloadButton.addEventListener('click', (event) => {
                event.preventDefault();
                this.reload();
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

            confirmImageButton.addEventListener('click', (event) => {
                event.preventDefault();
                this.confirmWebcamCapture();
            })
            
            this.loadSubmission(false);
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
            }, (() => {
                // if (!msg) {
                //     console.error('Failed to join external image capture socket');
                //     return;
                // }
                // if (msg.image_uploaded) {
                //     this.loadMobileSubmission();
                // }
            }));

            socket.on('imageUploaded', (msg) => {
                console.log('Submission changed, reloading...');
                if (msg.image_uploaded) {
                    this.loadSubmission(true);
                }
            });
        }
        async reload() {
            // Copmpare the submission dates

            const submittedImageResponse = await fetch(
                `${this.qr_code_url}/submitted_image`,
            )
            if (submittedImageResponse.ok) {
                // TODO: This makes two requests, when we could make just one. Improve that.
                const { uploadDate: mobileUploadDate } = await submittedImageResponse.json();     
                if (mobileUploadDate && this.submission_date) {
                    if (new Date(mobileUploadDate) > new Date(this.submission_date)) {
                        // Use the mobile submission
                        this.loadSubmission(true);
                    } else {
                        // Use the existing submission
                        this.loadSubmission(false);
                        return;
                    }
                }
            } else if (this.submission_date) {
                this.loadSubmission(false);
            } 
        }

        async loadSubmission(
            // If false, load the image from the most recent submission, if available
            // If true, load the image from the most recent submission that was made with the mobile app
            forMobile = true 
        ) {
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

            if (!forMobile && this.submitted_file_name) {
                const externalImageCaptureContainer = document.querySelector('#external-image-capture-container');
                console.log('Dataset', externalImageCaptureContainer.dataset);

                const submissionFilesUrl = externalImageCaptureContainer.dataset.submissionFilesUrl;
                if (!submissionFilesUrl) {
                    console.error('Submission files URL not found');
                    return;
                }
                const response = await fetch(
                    `${submissionFilesUrl}/${this.submitted_file_name}`,
                )

                if (!response.ok) {
                    throw new Error(`Failed to download file: ${response.status}`);
                }
                
                if (!response) {
                    return; // No submitted image available, yet
                }

                this.loadPreviewImageFromBlob(await response.blob());
            } else {
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

                this.loadPreviewImage({
                    data, type
                });
            } 

            reloadButton.removeAttribute('disabled');
        }

        loadPreviewImageFromBlob(blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;
                const data = dataUrl.split(',')[1];
                const type = dataUrl.split(';')[0].split(':')[1];
                this.loadPreviewImage({ data, type });
            };
            reader.readAsDataURL(blob);
        }

        loadPreviewImage({
            data, type
        }) {
            const uploadedImageContainer = document.querySelector('#uploaded-image-container');

            if (!uploadedImageContainer) {
                console.error('Uploaded image container not found');
                return;
            }

            uploadedImageContainer.innerHTML = `
                <img
                    id="preview-image"
                    class="img-fluid rounded border border-secondary mb-1"
                    style="width: 50%;"
                />
            `;

            const previewImage = uploadedImageContainer.querySelector('#preview-image');
            previewImage.src = `data:${type};base64,${data}`;

            const hiddenSubmissionInput = document.querySelector('#hidden-submission-input');
            hiddenSubmissionInput.value = `data:${type};base64,${data}`;
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

            const dataUrl = canvas.toDataURL('image/png');
            const data = dataUrl.split(',')[1];
            const type = dataUrl.split(';')[0].split(':')[1];   
            this.loadPreviewImage({
                data, type
            });

            this.closeConfirmationContainer();
        }

        closeConfirmationContainer() {
            const externalImageCaptureContainer = document.querySelector('#external-image-capture-container');
            const webcamConfirmationContainer = document.querySelector('#webcam-confirmation-container');
            if (!externalImageCaptureContainer || !webcamConfirmationContainer) {
                console.error('Webcam capture or confirmation container not found');
                return;
            }

            externalImageCaptureContainer.classList.remove('d-none');
            externalImageCaptureContainer.classList.add('d-block');
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