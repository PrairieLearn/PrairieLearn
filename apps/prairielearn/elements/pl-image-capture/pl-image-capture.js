/* global QRCode, io, bootstrap */

(() => {
  class PLImageCapture {
    constructor(
      uuid,
      answer_name,
      external_image_capture_url,
      variant_id,
      submitted_file_name,
      submission_date,
    ) {
      this.uuid = uuid;
      this.answer_name = answer_name;
      this.external_image_capture_url = external_image_capture_url;
      this.variant_id = variant_id;
      this.submitted_file_name = submitted_file_name;
      this.submission_date = submission_date;

      this.imageCaptureDiv = document.querySelector(`#image-capture-${uuid}`);
      if (!this.imageCaptureDiv) {
        throw new Error(`Image capture element with UUID ${uuid} not found.`);
      }

      const scanSubmissionButton = this.imageCaptureDiv.querySelector('.scan-submission-button');
      const reloadButton = this.imageCaptureDiv.querySelector('.reload-submission-button');
      const captureWithWebcamButton = this.imageCaptureDiv.querySelector('.capture-with-webcam-button');
      const captureImageButton = this.imageCaptureDiv.querySelector('.capture-image-button');
      const cancelWebcamButton = this.imageCaptureDiv.querySelector('.cancel-webcam-button');
      const retakeImageButton = this.imageCaptureDiv.querySelector('.retake-image-button');
      const confirmImageButton = this.imageCaptureDiv.querySelector('.confirm-image-button');

      if (
        !scanSubmissionButton ||
        !reloadButton ||
        !captureWithWebcamButton ||
        !captureImageButton ||
        !cancelWebcamButton ||
        !retakeImageButton ||
        !confirmImageButton
      ) {
        return;
      }

      scanSubmissionButton.addEventListener('inserted.bs.popover', () => {
        this.generateQrCode();
      });

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
      });

      this.loadSubmission(false);
      this.listenForExternalImageCapture();
    }

    generateQrCode() {
      const qrCodeSvg = new QRCode({
        content: this.external_image_capture_url,
        container: 'svg-viewbox',
      }).svg();

      const qrCode = document.querySelector(`#qr-code-${this.uuid}`);
      if (qrCode) {
        qrCode.innerHTML = qrCodeSvg;
      } else {
        throw new Error('QR code element not found.');
      }
    }

    // Listen for image captures from the user's other device, most likely their mobile phone.
    listenForExternalImageCapture() {
      const questionContainer = document.querySelector('.question-container');
      if (!questionContainer) return;

      const socket = io('/external-image-capture');

      socket.emit(
        'joinExternalImageCapture',
        {
          variant_id: this.variant_id,
          variant_token: questionContainer.dataset.variantToken,
          answer_name: this.answer_name,
        },
        (msg) => {
          if (!msg) {
            throw new Error('Failed to join external image capture room');
          }
        },
      );

      socket.on('externalImageCapture', () => {
        this.loadSubmission(true);
      });
    }
    async reload() {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector('.uploaded-image-container');
      const reloadButton = this.imageCaptureDiv.querySelector('.reload-submission-button');

      this.setLoadingSubmissionState(uploadedImageContainer, reloadButton);

      const submittedImageResponse = await fetch(
        `${this.external_image_capture_url}/submitted_image`,
      );
      if (submittedImageResponse.ok) {
        const {
          uploadDate: externalImageUploadDate,
          data: externalImageData,
          type: externalImageType,
        } = await submittedImageResponse.json();
        if (externalImageUploadDate && this.submission_date) {
          // External image capture and last submission images are available
          if (new Date(externalImageUploadDate) > new Date(this.submission_date)) {
            // Use the external image capture submission
            this.loadSubmissionPreview({
              data: externalImageData,
              type: externalImageType,
            });
          } else {
            // Use the existing submission
            this.loadSubmission(false);
          }
        }
      } else if (this.submission_date) {
        // Last submission is available, but no external image capture
        this.loadSubmission(false);
      } else {
        // No submission is available yet.
        this.setNoSubmissionAvailableYetState(uploadedImageContainer, reloadButton);
      }
      reloadButton.removeAttribute('disabled');
    }

    setLoadingSubmissionState(uploadedImageContainer, reloadButton) {
      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      if (!reloadButton) {
        throw new Error('Reload button not found');
      }

      reloadButton.setAttribute('disabled', 'disabled');

      uploadedImageContainer.innerHTML = `
        <div
            class="image-placeholder bg-body-secondary d-flex justify-content-center align-items-center rounded border w-100"
            style="height: 200px;"
        >
            <div class="spinning-wheel spinner-border">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
      `;
    }
ƒ
    setNoSubmissionAvailableYetState(uploadedImageContainer) {
      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }
      const imagePlaceholderDiv = uploadedImageContainer.querySelector('.image-placeholder');
      imagePlaceholderDiv.innerHTML = `
        <span class="text-muted">No image submitted yet.</span>
      `;
    }

    async loadSubmission(
      // If false, load the image from the most recent submission, if available
      // If true, load the image from the most recent submission that was made with the mobile app
      forMobile = true,
    ) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector('.uploaded-image-container');

      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      const reloadButton = this.imageCaptureDiv.querySelector('.reload-submission-button');

      this.setLoadingSubmissionState(uploadedImageContainer, reloadButton);

      if (!forMobile && this.submitted_file_name) {
        const imageCaptureContainer = this.imageCaptureDiv.querySelector('.image-capture-container');

        const submissionFilesUrl = imageCaptureContainer.dataset.submissionFilesUrl;
        if (!submissionFilesUrl) {
          throw new Error('Submission files URL not found');
        }
        const response = await fetch(`${submissionFilesUrl}/${this.submitted_file_name}`);

        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.status}`);
        }

        if (!response) {
          return; // No submitted image available, yet
        }

        this.loadSubmissionPreviewFromBlob(await response.blob());
      } else {
        const submittedImageResponse = await fetch(
          `${this.external_image_capture_url}/submitted_image`,
        );

        if (!submittedImageResponse.ok) {
          reloadButton.removeAttribute('disabled');
          if (submittedImageResponse.status === 404) {
            this.setNoSubmissionAvailableYetState(uploadedImageContainer, reloadButton);
            return;
          }
          throw new Error('Failed to load submitted image');
        }

        const { data, type } = await submittedImageResponse.json();

        this.loadSubmissionPreview({
          data,
          type,
        });

        // Dismiss the QR code popover if it is open. 
        const scanSubmissionButton = this.imageCaptureDiv.querySelector('.scan-submission-button');

        if (scanSubmissionButton) {
          const popover = bootstrap.Popover.getInstance(scanSubmissionButton);
          if (popover) {
            popover.hide();
          }
        }
      }

      reloadButton.removeAttribute('disabled');
    }

    loadSubmissionPreviewFromDataUrl(dataUrl) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector('.uploaded-image-container');

      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      const submissionPreview = document.createElement('img');
      submissionPreview.id = 'submission-preview';
      submissionPreview.className = 'img-fluid rounded border border-secondary w-100';
      submissionPreview.src = dataUrl;
      submissionPreview.alt = 'Submitted image preview';

      uploadedImageContainer.innerHTML = ''; // Clear previous content
      uploadedImageContainer.appendChild(submissionPreview);

      const hiddenSubmissionInput = this.imageCaptureDiv.querySelector('.hidden-submission-input');
      hiddenSubmissionInput.value = dataUrl;
    }

    loadSubmissionPreviewFromBlob(blob) {
      const reader = new FileReader();
      reader.onload = (event) => {
        this.loadSubmissionPreviewFromDataUrl(event.target.result);
      };
      reader.readAsDataURL(blob);
    }

    loadSubmissionPreview({ data, type }) {
      this.loadSubmissionPreviewFromDataUrl(`data:${type};base64,${data}`);
    }

    async startWebcamCapture() {
      const imageCaptureContainer = this.imageCaptureDiv.querySelector('.image-capture-container');
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector('.webcam-capture-container');
      const permissionMessage = webcamCaptureContainer.querySelector('.webcam-permission-message');

      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector('.webcam-confirmation-container');

      if (!imageCaptureContainer || !webcamCaptureContainer || !webcamConfirmationContainer) {
        throw new Error('Image capture or webcam capture container not found');
      }

      // Hide the image capture container
      imageCaptureContainer.classList.add('d-none');

      // Hide the confirmation container
      webcamConfirmationContainer.classList.add('d-none');

      // Show the webcam capture container
      webcamCaptureContainer.classList.remove('d-none');
      webcamCaptureContainer.classList.add('d-flex');

      try {
        // Stream the webcam video to the video element
        this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = this.imageCaptureDiv.querySelector('.webcam-video');
        if (!video) {
          throw new Error('Webcam video element not found');
        }
        video.srcObject = this.webcamStream;
        await video.play();
        permissionMessage.classList.add('d-none');
        const captureImageButton = this.imageCaptureDiv.querySelector('.capture-image-button');

        if (captureImageButton) {
          // Allow the user to capture an image
          captureImageButton.removeAttribute('disabled');
        } else {
          throw new Error('Capture image button not found');
        }
      } catch (err) {
        throw new Error('Could not start webcam: ' + err.message);
      }
    }

    deactivateVideoStream() {
      const video = this.imageCaptureDiv.querySelector('.webcam-video');
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach((track) => track.stop());
        this.webcamStream = null;
      }
      video.srcObject = null;
      video.pause();

      const captureImageButton = this.imageCaptureDiv.querySelector('.capture-image-button');
      if (captureImageButton) {
        captureImageButton.setAttribute('disabled', 'disabled');
      }
    }

    async handleCaptureImage() {
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector('.webcam-capture-container');
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector('.webcam-confirmation-container');
      const webcamImagePreviewCanvas = this.imageCaptureDiv.querySelector('.webcam-image-preview');
      const webcamVideo = webcamCaptureContainer.querySelector('.webcam-video');

      if (
        !webcamCaptureContainer ||
        !webcamConfirmationContainer ||
        !webcamImagePreviewCanvas ||
        !webcamVideo
      ) {
        throw new Error(
          'Webcam capture, image preview, video, or confirmation container not found',
        );
      }

      webcamImagePreviewCanvas.width = webcamVideo.videoWidth;
      webcamImagePreviewCanvas.height = webcamVideo.videoHeight;
      webcamImagePreviewCanvas
        .getContext('2d')
        .drawImage(webcamVideo, 0, 0, webcamVideo.videoWidth, webcamVideo.videoHeight);

      webcamCaptureContainer.classList.add('d-none');
      webcamCaptureContainer.classList.remove('d-flex');
      webcamConfirmationContainer.classList.remove('d-none');
      webcamConfirmationContainer.classList.add('d-flex');

      this.deactivateVideoStream();
    }

    async confirmWebcamCapture() {
      const canvas = this.imageCaptureDiv.querySelector('.webcam-image-preview');
      if (!canvas) {
        throw new Error('Webcam image preview canvas not found');
      }

      const dataUrl = canvas.toDataURL('image/png');
      this.loadSubmissionPreviewFromDataUrl(dataUrl);
      this.closeConfirmationContainer();
    }

    closeConfirmationContainer() {
      const imageCaptureContainer = this.imageCaptureDiv.querySelector('.image-capture-container');
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector('.webcam-confirmation-container');
      if (!imageCaptureContainer || !webcamConfirmationContainer) {
        throw new Error('Webcam capture or confirmation container not found');
      }

      imageCaptureContainer.classList.remove('d-none');
      imageCaptureContainer.classList.add('d-block');
      webcamConfirmationContainer.classList.add('d-none');
      webcamConfirmationContainer.classList.remove('d-flex');
    }

    cancelWebcamCapture() {
      const imageCaptureContainer = this.imageCaptureDiv.querySelector('.image-capture-container');
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector('.webcam-capture-container');
      const permissionMessage = this.imageCaptureDiv.querySelector('.webcam-permission-message');

      if (!imageCaptureContainer || !webcamCaptureContainer) {
        throw new Error('Image capture or webcam capture container not found');
      }

      imageCaptureContainer.classList.remove('d-none');

      webcamCaptureContainer.classList.add('d-none');
      webcamCaptureContainer.classList.remove('d-flex');

      permissionMessage.classList.remove('d-none');

      this.deactivateVideoStream();
    }
  }

  window.PLImageCapture = PLImageCapture;
})();
