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
      editable,
    ) {
      this.variant_opened_date = new Date();
      this.uuid = uuid;
      this.answer_name = answer_name;
      this.variant_id = variant_id;
      this.submitted_file_name = submitted_file_name;
      this.submission_date = submission_date;
      this.external_image_capture_url = external_image_capture_url;

      this.imageCaptureDiv = document.querySelector(`#image-capture-${uuid}`);
      if (!this.imageCaptureDiv) {
        throw new Error(`Image capture element with UUID ${uuid} not found.`);
      }

      if (editable !== 'True') {
        this.loadSubmission(false);
        return;
      }

      this.createCapturePreviewListeners();
      this.createExternalCaptureListeners();
      this.createWebcamCaptureListeners();

      this.loadSubmission(false);
      this.listenForExternalImageCapture();
    }

    createCapturePreviewListeners() {
      const reloadButton = this.imageCaptureDiv.querySelector('.reload-submission-button');

      if (!reloadButton) {
        throw new Error('Reload button not found in image capture element');
      }

      reloadButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.reload();
      });
    }

    createExternalCaptureListeners() {
      const captureWithMobileDeviceButton = this.imageCaptureDiv.querySelector(
        '.capture-with-mobile-device-button',
      );

      if (!captureWithMobileDeviceButton) {
        throw new Error('Capture with mobile device button not found in image capture element');
      }

      captureWithMobileDeviceButton.addEventListener('inserted.bs.popover', () => {
        this.generateQrCode();
      });
    }

    createWebcamCaptureListeners() {
      const captureWithWebcamButton = this.imageCaptureDiv.querySelector(
        '.capture-with-webcam-button',
      );

      const captureWebcamImageButton = this.imageCaptureDiv.querySelector(
        '.capture-webcam-image-button',
      );
      const cancelWebcamButton = this.imageCaptureDiv.querySelector('.cancel-webcam-button');

      const retakeWebcamImageButton = this.imageCaptureDiv.querySelector(
        '.retake-webcam-image-button',
      );
      const confirmWebcamImageButton = this.imageCaptureDiv.querySelector(
        '.confirm-webcam-image-button',
      );
      const cancelWebcamConfirmationButton = this.imageCaptureDiv.querySelector(
        '.cancel-webcam-confirmation-button',
      );

      if (
        !captureWithWebcamButton ||
        !captureWebcamImageButton ||
        !cancelWebcamButton ||
        !retakeWebcamImageButton ||
        !confirmWebcamImageButton ||
        !cancelWebcamConfirmationButton
      ) {
        throw new Error('One or more webcam capture buttons not found in image capture element');
      }

      captureWithWebcamButton.addEventListener('click', () => {
        this.startWebcamCapture();
      });

      captureWebcamImageButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.handleCaptureImage();
      });

      cancelWebcamButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.cancelWebcamCapture();
      });

      retakeWebcamImageButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.cancelWebcamCapture();
        this.startWebcamCapture();
      });

      confirmWebcamImageButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.confirmWebcamCapture();
      });

      cancelWebcamConfirmationButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.cancelConfirmationWebcam();
      });
    }

    // Switch to the specified container within the image capture element and hide all others.
    openContainer(containerName) {
      // Displays the captured image.
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );

      // Renders a live preview of the webcam for the user to capture an image.
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.webcam-capture-container',
      );

      // Displays the image captured from the webcam and allows the user to confirm or retake it.
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.webcam-confirmation-container',
      );

      if (!capturePreviewContainer || !webcamCaptureContainer || !webcamConfirmationContainer) {
        throw new Error('One or more containers not found in image capture element');
      }

      if (!['capture-preview', 'webcam-capture', 'webcam-confirmation'].includes(containerName)) {
        throw new Error(`Invalid container name: ${containerName}`);
      }

      // element corresponds to the container element. flex indicates whether the container uses a flexbox layout.
      const containers = [
        {
          name: 'capture-preview',
          element: capturePreviewContainer,
          flex: false,
        },
        {
          name: 'webcam-capture',
          element: webcamCaptureContainer,
          flex: true,
        },
        {
          name: 'webcam-confirmation',
          element: webcamConfirmationContainer,
          flex: true,
        },
      ];

      for (const container of containers) {
        if (container.name === containerName && container.element.classList.contains('d-none')) {
          // Show the container if it is currently hidden
          container.element.classList.remove('d-none');
          if (container.flex) {
            container.element.classList.add('d-flex');
          }
        } else if (!container.element.classList.contains('d-none')) {
          // Hide the container if it is not the one we want to show
          container.element.classList.add('d-none');
          if (container.flex) {
            container.element.classList.remove('d-flex');
          }
        }
      }
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
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.uploaded-image-container',
      );
      const reloadButton = this.imageCaptureDiv.querySelector('.reload-submission-button');

      this.setLoadingSubmissionState(uploadedImageContainer, reloadButton);

      // Retrieve the last submission, external image capture, and unsubmitted webcam capture.
      const availableSubmissions = [];

      // Add the last webcam submission, if available
      if (this.lastLocalWebcamSubmissionDate) {
        availableSubmissions.push({
          uploadDate: this.lastLocalWebcamSubmissionDate,
          method: 'webcam',
        });
      }

      // Add the last external image capture, if available
      const submittedImageResponse = await fetch(
        `${this.external_image_capture_url}/uploaded_image`,
      );

      let submittedImageResponseJson;

      if (submittedImageResponse.ok) {
        submittedImageResponseJson = await submittedImageResponse.json();
        if (
          submittedImageResponseJson.uploadDate &&
          new Date(submittedImageResponseJson.uploadDate) >= this.variant_opened_date
        ) {
          availableSubmissions.push({
            uploadDate: new Date(submittedImageResponseJson.uploadDate),
            method: 'external',
          });
        }
      }

      // Add the last submission, if available
      if (this.submission_date && this.submitted_file_name) {
        availableSubmissions.push({
          uploadDate: new Date(this.submission_date),
          method: 'submission',
        });
      }

      if (availableSubmissions.length === 0) {
        // No submissions available
        this.setNoSubmissionAvailableYetState(uploadedImageContainer, reloadButton);
        reloadButton.removeAttribute('disabled');
        return;
      }

      // Identify the most recent submission
      const mostRecentSubmission = availableSubmissions.reduce((latest, current) => {
        return new Date(current.uploadDate) > new Date(latest.uploadDate) ? current : latest;
      });

      // Load its data
      switch (mostRecentSubmission.method) {
        case 'webcam':
          this.loadSubmissionPreviewFromDataUrl(
            this.imageCaptureDiv.querySelector('.hidden-submission-input').value,
          );
          break;
        case 'external':
          this.loadSubmissionPreview({
            data: submittedImageResponseJson.data,
            type: submittedImageResponseJson.type,
          });
          break;
        case 'submission':
          this.loadSubmission(false);
          break;
        default:
          throw new Error('Unknown submission method');
      }
      reloadButton.removeAttribute('disabled');
    }

    setLoadingSubmissionState(uploadedImageContainer, reloadButton) {
      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      if (reloadButton) {
        reloadButton.setAttribute('disabled', 'disabled');
      }

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
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.uploaded-image-container',
      );

      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      const reloadButton = this.imageCaptureDiv.querySelector('.reload-submission-button');

      this.setLoadingSubmissionState(uploadedImageContainer, reloadButton);

      if (!forMobile && this.submitted_file_name) {
        const capturePreviewContainer = this.imageCaptureDiv.querySelector(
          '.capture-preview-container',
        );

        const submissionFilesUrl = capturePreviewContainer.dataset.submissionFilesUrl;
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
          `${this.external_image_capture_url}/uploaded_image`,
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
        const captureWithMobileDeviceButton = this.imageCaptureDiv.querySelector(
          '.capture-with-mobile-device-button',
        );

        if (captureWithMobileDeviceButton) {
          const popover = bootstrap.Popover.getInstance(captureWithMobileDeviceButton);
          if (popover) {
            popover.hide();
          }
        }
      }

      if (reloadButton) {
        reloadButton.removeAttribute('disabled');
      }
    }

    loadSubmissionPreviewFromDataUrl(dataUrl) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.uploaded-image-container',
      );

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
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.webcam-capture-container',
      );
      const permissionMessage = webcamCaptureContainer.querySelector('.webcam-permission-message');

      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.webcam-confirmation-container',
      );

      if (!capturePreviewContainer || !webcamCaptureContainer || !webcamConfirmationContainer) {
        throw new Error('Capture preview or webcam capture container not found');
      }

      this.openContainer('webcam-capture');

      try {
        // Stream the webcam video to the video element
        this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = this.imageCaptureDiv.querySelector('.webcam-video');
        video.srcObject = this.webcamStream;
        await video.play();
        permissionMessage.classList.add('d-none');
        const captureWebcamImageButton = this.imageCaptureDiv.querySelector(
          '.capture-webcam-image-button',
        );

        if (captureWebcamImageButton) {
          // Allow the user to capture an image
          captureWebcamImageButton.removeAttribute('disabled');
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

      const captureWebcamImageButton = this.imageCaptureDiv.querySelector(
        '.capture-webcam-image-button',
      );
      if (captureWebcamImageButton) {
        captureWebcamImageButton.setAttribute('disabled', 'disabled');
      }
    }

    async handleCaptureImage() {
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.webcam-capture-container',
      );
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.webcam-confirmation-container',
      );
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

      this.openContainer('webcam-confirmation');

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

      this.lastLocalWebcamSubmissionDate = new Date();
    }

    closeConfirmationContainer() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.webcam-confirmation-container',
      );
      if (!capturePreviewContainer || !webcamConfirmationContainer) {
        throw new Error('Webcam capture or confirmation container not found');
      }

      capturePreviewContainer.classList.remove('d-none');
      capturePreviewContainer.classList.add('d-block');
      webcamConfirmationContainer.classList.add('d-none');
      webcamConfirmationContainer.classList.remove('d-flex');
    }

    cancelWebcamCapture() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.webcam-capture-container',
      );
      const permissionMessage = this.imageCaptureDiv.querySelector('.webcam-permission-message');

      if (!capturePreviewContainer || !webcamCaptureContainer) {
        throw new Error('Capture preview or webcam capture container not found');
      }

      capturePreviewContainer.classList.remove('d-none');

      webcamCaptureContainer.classList.add('d-none');
      webcamCaptureContainer.classList.remove('d-flex');

      permissionMessage.classList.remove('d-none');

      this.deactivateVideoStream();
    }

    cancelConfirmationWebcam() {
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.webcam-confirmation-container',
      );
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );

      if (!webcamConfirmationContainer || !capturePreviewContainer) {
        throw new Error('Webcam confirmation or capture container not found');
      }

      webcamConfirmationContainer.classList.add('d-none');
      webcamConfirmationContainer.classList.remove('d-flex');

      capturePreviewContainer.classList.remove('d-none');
    }
  }

  window.PLImageCapture = PLImageCapture;
})();
