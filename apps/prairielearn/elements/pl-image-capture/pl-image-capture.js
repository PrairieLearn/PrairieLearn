/* global QRCode, io, bootstrap */

(() => {
  class PLImageCapture {
    constructor(uuid) {
      this.uuid = uuid;
      this.imageCaptureDiv = document.querySelector(`#image-capture-${uuid}`);

      if (!this.imageCaptureDiv) {
        throw new Error(`Image capture element with UUID ${uuid} not found.`);
      }

      const options = JSON.parse(this.imageCaptureDiv.dataset.options);

      if (!options.file_name) {
        throw new Error('File name is required in image capture options');
      }
      if (!options.variant_id) {
        throw new Error('Variant ID is required in image capture options');
      }
      if (options.mobile_capture_enabled === undefined || options.mobile_capture_enabled === null) {
        throw new Error('Mobile capture enabled option is required in image capture options');
      }

      this.file_name = options.file_name;
      this.variant_id = options.variant_id;
      this.editable = options.editable;

      this.external_image_capture_url = options.external_image_capture_url;
      this.submitted_file_name = options.submitted_file_name;
      this.submission_files_url = options.submission_files_url;
      this.mobile_capture_enabled = options.mobile_capture_enabled;

      if (!options.editable) {
        // If the image capture is not editable, only load the most recent submitted image
        // without initializing the image capture functionality.
        this.loadSubmission();
        return;
      }

      if (this.mobile_capture_enabled) {
        this.createExternalCaptureListeners();
      }
      this.createLocalCameraCaptureListeners();

      this.loadSubmission();
      if (this.mobile_capture_enabled) {
        this.listenForExternalImageCapture();
      }
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

      this.ensureElementsExist({
        captureWithLocalCameraButton,
        captureLocalCameraImageButton,
        cancelLocalCameraButton,
        retakeLocalCameraImageButton,
        confirmLocalCameraImageButton,
        cancelLocalCameraConfirmationButton,
      });

      captureWithLocalCameraButton.addEventListener('click', () => {
        this.startLocalCameraCapture();
      });

      captureLocalCameraImageButton.addEventListener('click', () => {
        this.handleCaptureImage();
      });

      cancelLocalCameraButton.addEventListener('click', () => {
        this.cancelLocalCameraCapture();
      });

      retakeLocalCameraImageButton.addEventListener('click', () => {
        this.cancelLocalCameraCapture();
        this.startLocalCameraCapture();
      });

      confirmLocalCameraImageButton.addEventListener('click', () => {
        this.confirmLocalCameraCapture();
      });

      cancelLocalCameraConfirmationButton.addEventListener('click', () => {
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
      if (
        !['capture-preview', 'local-camera-capture', 'local-camera-confirmation'].includes(
          containerName,
        )
      ) {
        throw new Error(`Invalid container name: ${containerName}`);
      }

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

      this.ensureElementsExist({
        capturePreviewContainer,
        localCameraCaptureContainer,
        localCameraConfirmationContainer,
      });

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
      if (!this.external_image_capture_url) {
        return;
      }

      const qrCode = document.querySelector(`#qr-code-${this.uuid}`);

      if (!qrCode) {
        throw new Error('QR code element not found.');
      }

      qrCode.innerHTML = new QRCode({
        content: this.external_image_capture_url,
        container: 'svg-viewbox',
      }).svg();
    }

    /**
     * Listen for external image captures submitted from the user's mobile device.
     */
    listenForExternalImageCapture() {
      const socket = io('/external-image-capture');
      const questionContainer = document.querySelector('.question-container');

      if (!questionContainer) {
        throw new Error('Question container not found. Could not obtain the variant token.');
      }

      socket.emit(
        'joinExternalImageCapture',
        {
          variant_id: this.variant_id,
          variant_token: questionContainer.dataset.variantToken,
          file_name: this.file_name,
        },
        (msg) => {
          if (!msg) {
            throw new Error('Failed to join external image capture room');
          }
        },
      );

      socket.on('externalImageCapture', (msg) => {
        this.loadCapturePreview({
          data: msg.file_content,
          type: 'image/jpeg',
        });

        // Acknowledge that the external image capture was received.
        socket.emit(
          'externalImageCaptureAck',
          {
            variant_id: this.variant_id,
            variant_token: questionContainer.dataset.variantToken,
            file_name: this.file_name,
          },
          (ackMsg) => {
            if (!ackMsg) {
              throw new Error('Failed to acknowledge external image capture');
            }
          },
        );

        const captureWithMobileDeviceButton = this.imageCaptureDiv.querySelector(
          '.js-capture-with-mobile-device-button',
        );

        if (captureWithMobileDeviceButton) {
          // Dismiss the QR code popover if it is open.
          const popover = bootstrap.Popover.getInstance(captureWithMobileDeviceButton);
          if (popover) {
            popover.hide();
          }
        }
      });
    }

    /**
     * Updates the uploaded image container to display that no image has been captured yet.
     * @param {HTMLElement} uploadedImageContainer
     */
    setNoCaptureAvailableYetState(uploadedImageContainer) {
      const imagePlaceholderDiv = uploadedImageContainer.querySelector('.js-image-placeholder');

      this.ensureElementsExist({
        imagePlaceholderDiv,
      });

      imagePlaceholderDiv.innerHTML = `
        <span class="text-muted">No image captured yet.</span>
      `;
    }

    /**
     * Updates the uploaded image container to display a loading state.
     * @param {HTMLElement} uploadedImageContainer
     */
    setLoadingCaptureState(uploadedImageContainer) {
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
    async loadSubmission() {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );

      this.ensureElementsExist({
        uploadedImageContainer,
      });

      this.setLoadingCaptureState(uploadedImageContainer);

      if (this.submitted_file_name) {
        if (!this.submission_files_url) {
          this.setNoCaptureAvailableYetState(uploadedImageContainer);
          throw new Error('Submission files URL not found');
        }
        const response = await fetch(`${this.submission_files_url}/${this.submitted_file_name}`);

        if (!response.ok) {
          this.setNoCaptureAvailableYetState(uploadedImageContainer);
          throw new Error(`Failed to download file: ${response.status}`);
        }

        this.loadCapturePreviewFromBlob(await response.blob());
      } else {
        // No submitted image available, yet
        this.setNoCaptureAvailableYetState(uploadedImageContainer);
      }
    }

    loadCapturePreviewFromDataUrl(dataUrl) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );

      this.ensureElementsExist({
        uploadedImageContainer,
      });

      const capturePreview = document.createElement('img');
      capturePreview.id = 'capture-preview';
      capturePreview.className = 'img-fluid rounded border bg-body-secondary w-100';
      capturePreview.src = dataUrl;
      capturePreview.alt = 'Captured image preview';

      uploadedImageContainer.innerHTML = '';
      uploadedImageContainer.appendChild(capturePreview);

      if (this.editable) {
        const hiddenCaptureInput = this.imageCaptureDiv.querySelector('.js-hidden-capture-input');
        hiddenCaptureInput.value = dataUrl;
      }
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
      const localCameraErrorMessage = localCameraCaptureContainer.querySelector(
        '.js-local-camera-error-message',
      );

      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );

      const localCameraVideo = this.imageCaptureDiv.querySelector('.js-local-camera-video');

      this.ensureElementsExist({
        capturePreviewContainer,
        localCameraCaptureContainer,
        localCameraErrorMessage,
        localCameraConfirmationContainer,
        localCameraVideo,
      });

      this.openContainer('local-camera-capture');

      localCameraErrorMessage.classList.add('d-none');

      try {
        // Stream the local camera video to the video element
        this.localCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        localCameraVideo.srcObject = this.localCameraStream;

        await localCameraVideo.play();

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
        localCameraErrorMessage.classList.remove('d-none');
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          localCameraErrorMessage.textContent =
            'Give permission to access your camera to capture an image.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          localCameraErrorMessage.textContent =
            'No camera found. Please connect a camera to your device.';
        } else {
          localCameraErrorMessage.textContent =
            'An error occurred while trying to access your camera.';
        }
        throw new Error('Could not start local camera: ' + err.message, err.name);
      }
    }

    deactivateVideoStream() {
      const localCameraVideo = this.imageCaptureDiv.querySelector('.js-local-camera-video');
      const captureLocalCameraImageButton = this.imageCaptureDiv.querySelector(
        '.js-capture-local-camera-image-button',
      );

      this.ensureElementsExist({
        localCameraVideo,
        captureLocalCameraImageButton,
      });

      if (this.localCameraStream) {
        this.localCameraStream.getTracks().forEach((track) => track.stop());
        this.localCameraStream = null;
      }

      localCameraVideo.srcObject = null;
      localCameraVideo.pause();

      // Prevent the user from capturing another image until the local camera is restarted.
      captureLocalCameraImageButton.setAttribute('disabled', 'disabled');
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

      this.ensureElementsExist({
        localCameraCaptureContainer,
        localCameraConfirmationContainer,
        localCameraImagePreviewCanvas,
        localCameraVideo,
      });

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
      const imagePreviewCanvas = this.imageCaptureDiv.querySelector(
        '.js-local-camera-image-preview',
      );

      this.ensureElementsExist({
        imagePreviewCanvas,
      });

      this.loadCapturePreviewFromDataUrl(imagePreviewCanvas.toDataURL('image/jpeg'));
      this.closeConfirmationContainer();
    }

    closeConfirmationContainer() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );
      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );

      this.ensureElementsExist({
        capturePreviewContainer,
        localCameraConfirmationContainer,
      });

      this.openContainer('capture-preview');
    }

    cancelLocalCameraCapture() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );
      const localCameraCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-capture-container',
      );
      const localCameraErrorMessage = this.imageCaptureDiv.querySelector(
        '.js-local-camera-error-message',
      );

      this.ensureElementsExist({
        capturePreviewContainer,
        localCameraCaptureContainer,
        localCameraErrorMessage,
      });

      this.openContainer('capture-preview');

      localCameraErrorMessage.classList.add('d-none');

      this.deactivateVideoStream();
    }

    cancelConfirmationLocalCamera() {
      const localCameraConfirmationContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-confirmation-container',
      );
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );

      this.ensureElementsExist({
        localCameraConfirmationContainer,
        capturePreviewContainer,
      });

      this.openContainer('capture-preview');
    }

    /**
     * Ensures that the provided elements exist. Throws an error if any element is not present.
     * @param {Object} containers An object wherein keys are element names and values are the elements.
     */
    ensureElementsExist(elements) {
      for (const elementName in elements) {
        if (!elements[elementName]) {
          throw new Error(
            `Element ${elementName} not found in image capture element with UUID ${this.uuid}`,
          );
        }
      }
    }
  }

  window.PLImageCapture = PLImageCapture;
})();
