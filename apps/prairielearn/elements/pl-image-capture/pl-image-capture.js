/* global QRCode, io, bootstrap */

(() => {
  class PLImageCapture {
    constructor(
      uuid
    ) {
      this.uuid = uuid;
      this.variant_opened_date = new Date();
      this.imageCaptureDiv = document.querySelector(`#image-capture-${uuid}`);

      if (!this.imageCaptureDiv) {
        throw new Error(`Image capture element with UUID ${uuid} not found.`);
      }

      const options = JSON.parse(this.imageCaptureDiv.dataset.options);

      if (!options.answer_name) {
        throw new Error('Answer name is required in image capture options');
      }
      if (!options.variant_id) {
        throw new Error('Variant ID is required in image capture options');
      }
      if (!options.external_image_capture_url) {
        throw new Error('External image capture URL is required in image capture options');
      }
      if (options.mobile_capture_enabled === undefined || options.mobile_capture_enabled === null) {
        throw new Error('Mobile capture enabled option is required in image capture options');
      }
      
      this.answer_name = options.answer_name;
      this.variant_id = options.variant_id;

      this.submitted_file_name = options.submitted_file_name;
      this.submission_date = options.submission_date;
      this.external_image_capture_url = options.external_image_capture_url;
      this.mobile_capture_enabled = options.mobile_capture_enabled;

      if (!options.editable) {
        // If the image capture is not editable, only load the most recent submitted image
        // without initializing the image capture functionality.
        this.loadSubmission(false);
        return;
      }

      if (this.mobile_capture_enabled) {
        this.createCapturePreviewListeners();
        this.createExternalCaptureListeners();
      }
      this.createLocalCameraCaptureListeners();

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
        '.js-capture-with-mobile-device-button',
      );

      if (!captureWithMobileDeviceButton) {
        throw new Error('Capture with mobile device button not found in image capture element');
      }

      captureWithMobileDeviceButton.addEventListener('inserted.bs.popover', () => {
        this.generateQrCode();
      });
    }

    createLocalCameraCaptureListeners() {
      const captureWithLocalCameraButton = this.imageCaptureDiv.querySelector(
        '.js-capture-with-local-camera-button',
      );

      const captureLocalCameraImageButton = this.imageCaptureDiv.querySelector(
        '.js-capture-local-camera-image-button',
      );
      const cancelLocalCameraButton = this.imageCaptureDiv.querySelector(
        '.js-cancel-local-camera-button',
      );

      const retakeLocalCameraImageButton = this.imageCaptureDiv.querySelector(
        '.js-retake-local-camera-image-button',
      );
      const confirmLocalCameraImageButton = this.imageCaptureDiv.querySelector(
        '.js-confirm-local-camera-image-button',
      );
      const cancelLocalCameraConfirmationButton = this.imageCaptureDiv.querySelector(
        '.js-cancel-local-camera-confirmation-button',
      );

      if (
        !captureWithLocalCameraButton ||
        !captureLocalCameraImageButton ||
        !cancelLocalCameraButton ||
        !retakeLocalCameraImageButton ||
        !confirmLocalCameraImageButton ||
        !cancelLocalCameraConfirmationButton
      ) {
        throw new Error(
          'One or more local camera capture buttons not found in image capture element',
        );
      }

      captureWithLocalCameraButton.addEventListener('click', () => {
        this.startLocalCameraCapture();
      });

      captureLocalCameraImageButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.handleCaptureImage();
      });

      cancelLocalCameraButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.cancelLocalCameraCapture();
      });

      retakeLocalCameraImageButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.cancelLocalCameraCapture();
        this.startLocalCameraCapture();
      });

      confirmLocalCameraImageButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.confirmLocalCameraCapture();
      });

      cancelLocalCameraConfirmationButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.cancelConfirmationLocalCamera();
      });
    }

    /**
     * Show the specified container within the image capture element and hide all others.
     *
     * @param {string} containerName The name of the container to open. Valid values are:
     * 'capture-preview', 'local-camera-capture', or 'local-camera-confirmation'.
     */
    openContainer(containerName) {
      // Displays the captured image.
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );

      // Renders a live preview of the local camera for the user to capture an image.
      const localCameraCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-capture-container',
      );

      // Displays the image captured from the local camera and allows the user to confirm or retake it.
      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );

      if (
        !capturePreviewContainer ||
        !localCameraCaptureContainer ||
        !localCameraConfirmationContainer
      ) {
        throw new Error('One or more containers not found in image capture element');
      }

      if (
        !['capture-preview', 'local-camera-capture', 'local-camera-confirmation'].includes(
          containerName,
        )
      ) {
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
          name: 'local-camera-capture',
          element: localCameraCaptureContainer,
          flex: true,
        },
        {
          name: 'local-camera-confirmation',
          element: localCameraConfirmationContainer,
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
        content: `${this.external_image_capture_url}?answer_name=${this.answer_name}`,
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
     * Reloads the most recent image capture. This can be from the last local camera capture,
     * the last external image capture, or the last submission.
     */
    async reload() {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );
      const reloadButton = this.imageCaptureDiv.querySelector('.js-reload-capture-button');

      this.setLoadingCaptureState(uploadedImageContainer, reloadButton);

      const availableCaptures = [];

      // Add the last local camera capture, if available
      if (this.lastLocalLocalCameraCaptureDate) {
        availableCaptures.push({
          uploadDate: this.lastLocalLocalCameraCaptureDate,
          method: 'local-camera',
        });
      }

      let externalImageCaptureJson;
      if (this.mobile_capture_enabled) {
        // Add the last external image capture, if available
        const externalImageCaptureResponse = await fetch(
          `${this.external_image_capture_url}/uploaded_image?answer_name=${this.answer_name}`,
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
        case 'local-camera':
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
        '.js-uploaded-image-container',
      );

      if (!uploadedImageContainer) {
        throw new Error('Uploaded image container not found');
      }

      const reloadButton = this.imageCaptureDiv.querySelector('.js-reload-capture-button');

      this.setLoadingCaptureState(uploadedImageContainer, reloadButton);

      if (!forExternalImageCapture && this.submitted_file_name) {
        const capturePreviewContainer = this.imageCaptureDiv.querySelector(
          '.js-capture-preview-container',
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
          `${this.external_image_capture_url}/uploaded_image?answer_name=${this.answer_name}`,
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
        '.js-uploaded-image-container',
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

    async startLocalCameraCapture() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );
      const localCameraCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-capture-container',
      );
      const permissionMessage = localCameraCaptureContainer.querySelector(
        '.js-local-camera-permission-message',
      );

      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );

      if (
        !capturePreviewContainer ||
        !localCameraCaptureContainer ||
        !localCameraConfirmationContainer
      ) {
        throw new Error('Capture preview or local camera capture container not found');
      }

      this.openContainer('local-camera-capture');

      try {
        // Stream the local camera video to the video element
        this.localCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = this.imageCaptureDiv.querySelector('.js-local-camera-video');
        video.srcObject = this.localCameraStream;
        await video.play();

        // Hide the permission message
        permissionMessage.classList.add('d-none');

        const captureLocalCameraImageButton = this.imageCaptureDiv.querySelector(
          '.js-capture-local-camera-image-button',
        );

        if (captureLocalCameraImageButton) {
          // Allow the user to capture an image
          captureLocalCameraImageButton.removeAttribute('disabled');
        } else {
          throw new Error('Capture image button not found');
        }
      } catch (err) {
        throw new Error('Could not start local camera: ' + err.message);
      }
    }

    deactivateVideoStream() {
      const video = this.imageCaptureDiv.querySelector('.js-local-camera-video');
      if (this.localCameraStream) {
        this.localCameraStream.getTracks().forEach((track) => track.stop());
        this.localCameraStream = null;
      }
      video.srcObject = null;
      video.pause();

      const captureLocalCameraImageButton = this.imageCaptureDiv.querySelector(
        '.js-capture-local-camera-image-button',
      );

      // Prevent the user from capturing another image until the local camera is restarted.
      if (captureLocalCameraImageButton) {
        captureLocalCameraImageButton.setAttribute('disabled', 'disabled');
      }
    }

    async handleCaptureImage() {
      const localCameraCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-capture-container',
      );
      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );
      const localCameraImagePreviewCanvas = this.imageCaptureDiv.querySelector(
        '.js-local-camera-image-preview',
      );
      const localCameraVideo = localCameraCaptureContainer.querySelector('.js-local-camera-video');

      if (
        !localCameraCaptureContainer ||
        !localCameraConfirmationContainer ||
        !localCameraImagePreviewCanvas ||
        !localCameraVideo
      ) {
        throw new Error(
          'Local camera capture, image preview, video, or confirmation container not found',
        );
      }

      localCameraImagePreviewCanvas.width = localCameraVideo.videoWidth;
      localCameraImagePreviewCanvas.height = localCameraVideo.videoHeight;
      localCameraImagePreviewCanvas
        .getContext('2d')
        .drawImage(
          localCameraVideo,
          0,
          0,
          localCameraVideo.videoWidth,
          localCameraVideo.videoHeight,
        );

      this.openContainer('local-camera-confirmation');

      this.deactivateVideoStream();
    }

    async confirmLocalCameraCapture() {
      const canvas = this.imageCaptureDiv.querySelector('.js-local-camera-image-preview');
      if (!canvas) {
        throw new Error('Local camera image preview canvas not found');
      }

      const dataUrl = canvas.toDataURL('image/png');
      this.loadCapturePreviewFromDataUrl(dataUrl);
      this.closeConfirmationContainer();

      this.lastLocalLocalCameraCaptureDate = new Date();
    }

    closeConfirmationContainer() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );
      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );
      if (!capturePreviewContainer || !localCameraConfirmationContainer) {
        throw new Error('Local camera capture or confirmation container not found');
      }

      this.openContainer('capture-preview');
    }

    cancelLocalCameraCapture() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );
      const localCameraCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-capture-container',
      );
      const permissionMessage = this.imageCaptureDiv.querySelector(
        '.js-local-camera-permission-message',
      );

      if (!capturePreviewContainer || !localCameraCaptureContainer) {
        throw new Error('Capture preview or local camera capture container not found');
      }

      this.openContainer('capture-preview');

      permissionMessage.classList.remove('d-none');

      this.deactivateVideoStream();
    }

    cancelConfirmationLocalCamera() {
      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );

      if (!localCameraConfirmationContainer || !capturePreviewContainer) {
        throw new Error('Local camera confirmation or capture container not found');
      }

      this.openContainer('capture-preview');
    }
  }

  window.PLImageCapture = PLImageCapture;
})();
