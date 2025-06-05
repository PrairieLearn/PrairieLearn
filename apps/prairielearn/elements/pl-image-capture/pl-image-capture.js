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
      mobile_capture_enabled,
    ) {
      this.variant_opened_date = new Date();
      this.uuid = uuid;
      this.answer_name = answer_name;
      this.variant_id = variant_id;
      this.submitted_file_name = submitted_file_name;
      this.submission_date = submission_date;
      this.external_image_capture_url = external_image_capture_url;
      this.mobile_capture_enabled = mobile_capture_enabled === 'True';

      this.imageCaptureDiv = document.querySelector(`#image-capture-${uuid}`);

      if (!this.imageCaptureDiv) {
        throw new Error(`Image capture element with UUID ${uuid} not found.`);
      }

      if (editable !== 'True') {
        // If the image capture is not editable, only load the most recent submitted image
        // without initializing the image capture functionality.
        this.loadSubmission(false);
        return;
      }

      if (this.mobile_capture_enabled) {
        this.createCapturePreviewListeners();
        this.createExternalCaptureListeners();
      }
      this.createWebcamCaptureListeners();

      this.loadSubmission(false);
      if (this.mobile_capture_enabled) {
        this.listenForExternalImageCapture();
      }
    }

    createCapturePreviewListeners() {
      const reloadButton = this.imageCaptureDiv.querySelector('.js-reload-capture-button');

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
        '.js-capture-with-webcam-button',
      );

      const captureWebcamImageButton = this.imageCaptureDiv.querySelector(
        '.js-capture-webcam-image-button',
      );
      const cancelWebcamButton = this.imageCaptureDiv.querySelector('.js-cancel-webcam-button');

      const retakeWebcamImageButton = this.imageCaptureDiv.querySelector(
        '.js-retake-webcam-image-button',
      );
      const confirmWebcamImageButton = this.imageCaptureDiv.querySelector(
        '.js-confirm-webcam-image-button',
      );
      const cancelWebcamConfirmationButton = this.imageCaptureDiv.querySelector(
        '.js-cancel-webcam-confirmation-button',
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

    /**
     * Show the specified container within the image capture element and hide all others.
     *
     * @param {string} containerName The name of the container to open. Valid values are:
     * 'capture-preview', 'webcam-capture', or 'webcam-confirmation'.
     */
    openContainer(containerName) {
      // Displays the captured image.
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );

      // Renders a live preview of the webcam for the user to capture an image.
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-capture-container',
      );

      // Displays the image captured from the webcam and allows the user to confirm or retake it.
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-confirmation-container',
      );

      if (!capturePreviewContainer || !webcamCaptureContainer || !webcamConfirmationContainer) {
        throw new Error('One or more containers not found in image capture element');
      }

      if (!['capture-preview', 'webcam-capture', 'webcam-confirmation'].includes(containerName)) {
        throw new Error(`Invalid container name: ${containerName}`);
      }

      // element corresponds to the container element. flex indicates if the container uses a flexbox layout when shown.
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

    /**
     * Listen for external image captures submitted from the user's mobile device.
     */
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

    /**
     * Reloads the most recent image capture. This can be from the last webcam capture,
     * the last external image capture, or the last submission.
     */
    async reload() {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );
      const reloadButton = this.imageCaptureDiv.querySelector('.js-reload-capture-button');

      this.setLoadingCaptureState(uploadedImageContainer, reloadButton);

      const availableCaptures = [];

      // Add the last webcam capture, if available
      if (this.lastLocalWebcamCaptureDate) {
        availableCaptures.push({
          uploadDate: this.lastLocalWebcamCaptureDate,
          method: 'webcam',
        });
      }

      let externalImageCaptureJson;
      if (this.mobile_capture_enabled) {
        // Add the last external image capture, if available
        const externalImageCaptureResponse = await fetch(
          `${this.external_image_capture_url}/uploaded_image`,
        );

        if (externalImageCaptureResponse.ok) {
          externalImageCaptureJson = await externalImageCaptureResponse.json();
          if (
            externalImageCaptureJson.uploadDate &&
            // Excludes unsaved captures from previous page views of the current variant.
            new Date(externalImageCaptureJson.uploadDate) >= this.variant_opened_date
          ) {
            availableCaptures.push({
              uploadDate: new Date(externalImageCaptureJson.uploadDate),
              method: 'external',
            });
          }
        }
      }

      // Add the last submission, if available
      if (this.submission_date && this.submitted_file_name) {
        availableCaptures.push({
          uploadDate: new Date(this.submission_date),
          method: 'submission',
        });
      }

      if (availableCaptures.length === 0) {
        // No captures available
        this.setNoCaptureAvailableYetState(uploadedImageContainer, reloadButton);
        reloadButton.removeAttribute('disabled');
        return;
      }

      // Select the most recent capture
      const mostRecentCapture = availableCaptures.reduce((latest, current) => {
        return new Date(current.uploadDate) > new Date(latest.uploadDate) ? current : latest;
      });

      // Use the most recent capture to load the capture preview.
      switch (mostRecentCapture.method) {
        case 'webcam':
          this.loadCapturePreviewFromDataUrl(
            this.imageCaptureDiv.querySelector('.js-hidden-capture-input').value,
          );
          break;
        case 'external':
          if (externalImageCaptureJson) {
            this.loadCapturePreview({
              data: externalImageCaptureJson.data,
              type: externalImageCaptureJson.type,
            });
          }
          break;
        case 'submission':
          this.loadSubmission(false);
          break;
        default:
          throw new Error('Unknown submission method');
      }
      reloadButton.removeAttribute('disabled');
    }

    setNoCaptureAvailableYetState(uploadedImageContainer) {
      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }
      const imagePlaceholderDiv = uploadedImageContainer.querySelector('.js-image-placeholder');
      imagePlaceholderDiv.innerHTML = `
        <span class="text-muted">No image captured yet.</span>
      `;
    }

    setLoadingCaptureState(uploadedImageContainer, reloadButton) {
      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      if (reloadButton) {
        reloadButton.setAttribute('disabled', 'disabled');
      }

      uploadedImageContainer.innerHTML = `
        <div
            class="js-image-placeholder bg-body-secondary d-flex justify-content-center align-items-center rounded border w-100"
            style="height: 200px;"
        >
            <div class="spinning-wheel spinner-border">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
      `;
    }

    /**
     * Loads the most recent submission or external image capture.
     *
     * @param {boolean} forExternalImageCapture If true, load the image from the most recent external image capture.
     * If false, load the image from the most recent submission.
     */
    async loadSubmission(forExternalImageCapture = true) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.uploaded-image-container',
      );

      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      const reloadButton = this.imageCaptureDiv.querySelector('.js-reload-capture-button');

      this.setLoadingCaptureState(uploadedImageContainer, reloadButton);

      if (!forExternalImageCapture && this.submitted_file_name) {
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

        this.loadCapturePreviewFromBlob(await response.blob());
      } else {
        const submittedImageResponse = await fetch(
          `${this.external_image_capture_url}/uploaded_image`,
        );

        if (!submittedImageResponse.ok) {
          if (reloadButton) {
            reloadButton.removeAttribute('disabled');
          }
          if (submittedImageResponse.status === 404) {
            this.setNoCaptureAvailableYetState(uploadedImageContainer, reloadButton);
            return;
          }
          throw new Error('Failed to load submitted image');
        }

        const { data, type } = await submittedImageResponse.json();

        this.loadCapturePreview({
          data,
          type,
        });

        // Dismiss the QR code popover if it is open.
        const captureWithMobileDeviceButton = this.imageCaptureDiv.querySelector(
          '.js-capture-with-mobile-device-button',
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

    loadCapturePreviewFromDataUrl(dataUrl) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.uploaded-image-container',
      );

      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      const capturePreview = document.createElement('img');
      capturePreview.id = 'capture-preview';
      capturePreview.className = 'img-fluid rounded border border-secondary w-100';
      capturePreview.src = dataUrl;
      capturePreview.alt = 'Captured image preview';

      uploadedImageContainer.innerHTML = '';
      uploadedImageContainer.appendChild(capturePreview);

      const hiddenCaptureInput = this.imageCaptureDiv.querySelector('.js-hidden-capture-input');
      hiddenCaptureInput.value = dataUrl;
    }

    loadCapturePreviewFromBlob(blob) {
      const reader = new FileReader();
      reader.onload = (event) => {
        this.loadCapturePreviewFromDataUrl(event.target.result);
      };
      reader.readAsDataURL(blob);
    }

    loadCapturePreview({ data, type }) {
      this.loadCapturePreviewFromDataUrl(`data:${type};base64,${data}`);
    }

    async startWebcamCapture() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-capture-container',
      );
      const permissionMessage = webcamCaptureContainer.querySelector('.webcam-permission-message');

      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-confirmation-container',
      );

      if (!capturePreviewContainer || !webcamCaptureContainer || !webcamConfirmationContainer) {
        throw new Error('Capture preview or webcam capture container not found');
      }

      this.openContainer('webcam-capture');

      try {
        // Stream the webcam video to the video element
        this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = this.imageCaptureDiv.querySelector('.js-webcam-video');
        video.srcObject = this.webcamStream;
        await video.play();

        // Hide the permission message
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

      // Prevent the user from capturing another image until the webcam is restarted.
      if (captureWebcamImageButton) {
        captureWebcamImageButton.setAttribute('disabled', 'disabled');
      }
    }

    async handleCaptureImage() {
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-capture-container',
      );
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-confirmation-container',
      );
      const webcamImagePreviewCanvas = this.imageCaptureDiv.querySelector('.js-webcam-image-preview');
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
      const canvas = this.imageCaptureDiv.querySelector('.js-webcam-image-preview');
      if (!canvas) {
        throw new Error('Webcam image preview canvas not found');
      }

      const dataUrl = canvas.toDataURL('image/png');
      this.loadCapturePreviewFromDataUrl(dataUrl);
      this.closeConfirmationContainer();

      this.lastLocalWebcamCaptureDate = new Date();
    }

    closeConfirmationContainer() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-confirmation-container',
      );
      if (!capturePreviewContainer || !webcamConfirmationContainer) {
        throw new Error('Webcam capture or confirmation container not found');
      }

      this.openContainer('capture-preview');
    }

    cancelWebcamCapture() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );
      const webcamCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-capture-container',
      );
      const permissionMessage = this.imageCaptureDiv.querySelector('.js-webcam-permission-message');

      if (!capturePreviewContainer || !webcamCaptureContainer) {
        throw new Error('Capture preview or webcam capture container not found');
      }

      this.openContainer('capture-preview');

      permissionMessage.classList.remove('d-none');

      this.deactivateVideoStream();
    }

    cancelConfirmationWebcam() {
      const webcamConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-webcam-confirmation-container',
      );
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.capture-preview-container',
      );

      if (!webcamConfirmationContainer || !capturePreviewContainer) {
        throw new Error('Webcam confirmation or capture container not found');
      }

      this.openContainer('capture-preview');
    }
  }

  window.PLImageCapture = PLImageCapture;
})();
