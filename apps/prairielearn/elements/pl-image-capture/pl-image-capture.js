/* global QRCode, io, bootstrap, Cropper */

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

      this.previousState = null;
      this.selectedContainerName = 'capture-preview';

      if (!this.editable) {
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

      this.createCropRotateListeners();
      this.createSaveListeners();
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

      const applyChangesButton = this.imageCaptureDiv.querySelector('.js-apply-changes-button');

      this.ensureElementsExist({
        captureWithLocalCameraButton,
        captureLocalCameraImageButton,
        cancelLocalCameraButton,
        retakeLocalCameraImageButton,
        confirmLocalCameraImageButton,
        cancelLocalCameraConfirmationButton,
        applyChangesButton,
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

      applyChangesButton.addEventListener('click', () => {
        this.confirmCropRotateChanges();
      });
    }

    createCropRotateListeners() {
      // Rotation angle, in degrees, set by clicking the clockwise and counterclockwise 90-degree rotation buttons.
      this.baseRotationAngle = 0;

      // Rotation angle, in degrees, set by the rotation slider.
      // The sum of this and the base rotation angle gives the total rotation angle, which is applied to the image.
      this.offsetRotationAngle = 0;

      // Tracked to preserve flip transformations when the user rotates the image.
      this.flippedX = false;
      this.flippedY = false;

      const cropRotateButton = this.imageCaptureDiv.querySelector('.js-crop-rotate-button');
      const rotationSlider = this.imageCaptureDiv.querySelector('.js-rotation-slider');
      const cancelCropRotateButton = this.imageCaptureDiv.querySelector(
        '.js-cancel-crop-rotate-button',
      );

      const rotateClockwiseButton = this.imageCaptureDiv.querySelector(
        '.js-rotate-clockwise-button',
      );
      const rotateCounterclockwiseButton = this.imageCaptureDiv.querySelector(
        '.js-rotate-counterclockwise-button',
      );

      const flipHorizontalButton = this.imageCaptureDiv.querySelector('.js-flip-horizontal-button');
      const flipVerticalButton = this.imageCaptureDiv.querySelector('.js-flip-vertical-button');

      this.ensureElementsExist({
        cropRotateButton,
        rotationSlider,
        cancelCropRotateButton,
        flipHorizontalButton,
        flipVerticalButton,
      });

      cropRotateButton.addEventListener('click', () => {
        this.startCropRotate();
      });

      rotationSlider.addEventListener('input', (event) => {
        const newRotationAngle = parseFloat(event.target.value);
        if (isNaN(newRotationAngle)) {
          throw new Error('Invalid rotation angle');
        }
        this.setRotationOffset(newRotationAngle);
      });

      rotateClockwiseButton.addEventListener('click', () => {
        this.handleRotate90Degrees(true);
      });

      rotateCounterclockwiseButton.addEventListener('click', () => {
        this.handleRotate90Degrees(false);
      });

      flipHorizontalButton.addEventListener('click', () => {
        this.handleFlip(true);
      });

      flipVerticalButton.addEventListener('click', () => {
        this.handleFlip(false);
      });

      cancelCropRotateButton.addEventListener('click', () => {
        this.cancelCropRotate();
      });
    }

    saveChanges() {
      if (this.selectedContainerName === 'crop-rotate') {
        this.confirmCropRotateChanges();
      } else if (this.selectedContainerName === 'local-camera-confirmation') {
        this.confirmLocalCameraCapture();
      }
    }

    createSaveListeners() {
      const saveButton = document.querySelector('.question-save');
      const saveAndGradeButton = document.querySelector('.question-grade');

      if (saveButton) {
        // Use mousedown to ensure that the changes are applied before the save action is triggered.
        saveButton.addEventListener('mousedown', () => {
          this.saveChanges();
        });
      }
      if (saveAndGradeButton) {
        // Use mousedown to ensure that the changes are applied before the save and grade action is triggered.
        saveAndGradeButton.addEventListener('mousedown', () => {
          this.saveChanges();
        });
      }
    }

    /**
     * Show the specified container within the image capture element and hide all others.
     *
     * @param {string} containerName The name of the container to open. Valid values are:
     * 'capture-preview', 'local-camera-capture', or 'local-camera-confirmation'.
     */
    openContainer(containerName) {
      if (
        ![
          'capture-preview',
          'local-camera-capture',
          'local-camera-confirmation',
          'crop-rotate',
        ].includes(containerName)
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

      // Displays an interface for cropping and rotating the captured image.
      const cropRotateContainer = this.imageCaptureDiv.querySelector('.js-crop-rotate-container');

      this.ensureElementsExist({
        capturePreviewContainer,
        localCameraCaptureContainer,
        localCameraConfirmationContainer,
        cropRotateContainer,
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
        {
          name: 'crop-rotate',
          element: cropRotateContainer,
          flex: false,
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

      this.selectedContainerName = containerName;
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
            class="js-image-placeholder bg-body-secondary d-flex justify-content-center align-items-center border-bottom w-100"
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

    loadCapturePreviewFromDataUrl({ dataUrl, originalCapture = true }) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );

      this.ensureElementsExist({
        uploadedImageContainer,
      });

      const capturePreview = document.createElement('img');
      capturePreview.className = 'capture-preview img-fluid bg-body-secondary w-100 border-bottom';

      capturePreview.src = dataUrl;
      capturePreview.alt = 'Captured image preview';

      uploadedImageContainer.innerHTML = '';
      uploadedImageContainer.appendChild(capturePreview);

      if (originalCapture) {
        capturePreview.addEventListener(
          'load',
          () => {
            // This is used later to set the height of the crop/rotate container.
            this.capturePreviewHeight = capturePreview.clientHeight;
          },
          { once: true },
        );
      }

      if (this.editable) {
        const hiddenCaptureInput = this.imageCaptureDiv.querySelector('.js-hidden-capture-input');
        hiddenCaptureInput.value = dataUrl;

        if (originalCapture) {
          const hiddenOriginalCaptureInput = this.imageCaptureDiv.querySelector(
            '.js-hidden-original-capture-input',
          );
          hiddenOriginalCaptureInput.value = dataUrl;
          if (this.cropper) {
            this.resetCropRotate();
          }
        }
        this.showCropRotateButton();
      }
    }

    loadCapturePreviewFromBlob(blob) {
      const reader = new FileReader();
      reader.onload = (event) => {
        this.loadCapturePreviewFromDataUrl({ dataUrl: event.target.result });
      };
      reader.readAsDataURL(blob);
    }

    loadCapturePreview({ data, type }) {
      this.loadCapturePreviewFromDataUrl({ dataUrl: `data:${type};base64,${data}` });
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

      if (!localCameraErrorMessage.classList.contains('d-none')) {
        localCameraErrorMessage.classList.add('d-none');
      }

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

      this.loadCapturePreviewFromDataUrl({ dataUrl: imagePreviewCanvas.toDataURL('image/jpeg') });
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

    showCropRotateButton() {
      const cropRotateButton = this.imageCaptureDiv.querySelector('.js-crop-rotate-button');

      if (!cropRotateButton) {
        throw new Error('Crop/rotate button not found in image capture element');
      }

      cropRotateButton.classList.remove('d-none');
    }

    startCropRotate() {
      this.openContainer('crop-rotate');

      if (!this.cropper) {
        // Used by CropperJS to initialize the cropper instance.
        const cropperImage = this.imageCaptureDiv.querySelector('.js-cropper-base-image');
        this.ensureElementsExist({
          cropperImage,
        });

        // Use the image capture prior to any crop or rotation as the cropper image source.
        // That way, the user can bring any part of the original image cropped out while editing back into view.
        cropperImage.src = this.imageCaptureDiv.querySelector(
          '.js-hidden-original-capture-input',
        ).value;

        this.cropper = new Cropper.default(
          `#image-capture-${this.uuid} .js-cropper-container .js-cropper-base-image`,
        );
        this.cropper.getCropperCanvas().scaleStep = 0;

        this.previousState = {
          transformation: this.cropper.getCropperImage().$getTransform(),
          selection: {
            x: this.cropper.getCropperSelection().x,
            y: this.cropper.getCropperSelection().y,
            width: this.cropper.getCropperSelection().width,
            height: this.cropper.getCropperSelection().height,
          },
          baseRotationAngle: 0,
          offsetRotationAngle: 0,
          flippedX: false,
          flippedY: false,
        };
      } else {
        // If the cropper already exists, update its image source to the original capture.
        this.cropper.getCropperImage().src = this.imageCaptureDiv.querySelector(
          '.js-hidden-original-capture-input',
        ).value;
      }

      const cropperHandle = this.imageCaptureDiv.querySelector(
        '.js-cropper-container cropper-handle[action="move"]',
      );
      const cropperCanvas = this.imageCaptureDiv.querySelector(
        '.js-cropper-container cropper-canvas',
      );

      this.ensureElementsExist({
        cropperHandle,
        cropperCanvas,
      });

      if (!this.capturePreviewHeight) {
        throw new Error(
          'Capture preview height not set. Please ensure the capture preview image is loaded before starting crop/rotate.',
        );
      }

      cropperCanvas.style.height = this.capturePreviewHeight + 'px';
      cropperHandle.setAttribute('theme-color', 'rgba(0, 0, 0, 0)');
    }

    /**
     * Sets the rotation offset angle for the cropper image.
     * This angle is added to the base rotation angle to calculate the total rotation angle.
     * @param {number} offsetRotationAngle The offset rotation angle in degrees.
     */
    setRotationOffset(offsetRotationAngle) {
      if (!this.cropper) {
        throw new Error('Cropper instance not initialized. Please start crop/rotate first.');
      }

      this.offsetRotationAngle = offsetRotationAngle;
      this.updateImageRotationAngle();
    }

    /**
     * Rotates the image by 90 degrees clockwise or counterclockwise.
     * @param {boolean} clockwise If true, rotates the image 90 degrees clockwise.
     * If false, rotates it 90 degrees counterclockwise.
     */
    handleRotate90Degrees(clockwise) {
      if (!this.cropper) {
        throw new Error('Cropper instance not initialized. Please start crop/rotate first.');
      }

      this.baseRotationAngle += clockwise ? 90 : -90;
      this.updateImageRotationAngle();
    }

    /**
     * Flips the image horizontally or vertically.
     * @param {boolean} horizontal If true, flips the image horizontally. If false, flips it vertically.
     */
    handleFlip(horizontal) {
      if (!this.cropper) {
        throw new Error('Cropper instance not initialized. Please start crop/rotate first.');
      }

      if (horizontal) {
        this.flippedX = !this.flippedX;
      } else {
        this.flippedY = !this.flippedY;
      }

      this.cropper.getCropperImage().$scale(
        horizontal
          ? -1 // Flip horizontally
          : 1, // Leave the image horizontally unchanged
        horizontal
          ? 1 // Leave the image vertically unchanged
          : -1, // Flip vertically
      );
    }

    /**
     * Updates the rotation angle of the cropper image using the base and offset rotation angles.
     * Preserves existing scale and translation of the image.
     */
    updateImageRotationAngle() {
      const totalRotationAngle = this.baseRotationAngle + this.offsetRotationAngle;
      const rotationAngleRad = (totalRotationAngle * Math.PI) / 180;

      const cos = Math.cos(rotationAngleRad);
      const sin = Math.sin(rotationAngleRad);

      const image = this.cropper.getCropperImage();
      const transform = image.$getTransform();
      if (!transform) {
        throw new Error('Cropper image transform not found. Please start crop/rotate first.');
      }

      const [
        prevHorizontalScale,
        prevVerticalSkewAngle,
        prevHorizontalSkewAngle,
        prevVerticalScale,
        prevHorizontalTranslation,
        prevVerticalTranslation,
      ] = transform;

      // Extract the existing scale factors from the transformation matrix
      const scaleX =
        (this.flippedX ? -1 : 1) * Math.hypot(prevHorizontalScale, prevVerticalSkewAngle);
      const scaleY =
        (this.flippedY ? -1 : 1) * Math.hypot(prevHorizontalSkewAngle, prevVerticalScale);

      // Apply the new rotation while preserving the existing scale and translation
      image.$setTransform(
        scaleX * cos,
        scaleX * sin,
        -scaleY * sin,
        scaleY * cos,
        prevHorizontalTranslation,
        prevVerticalTranslation,
      );
    }

    resetCropRotate() {
      if (!this.cropper) {
        throw new Error('Cropper instance not initialized. Please start crop/rotate first.');
      }

      this.cropper.getCropperImage().$resetTransform();
      this.cropper.getCropperImage().$center('contain');
      this.cropper.getCropperSelection().$reset();

      this.baseRotationAngle = 0;
      this.offsetRotationAngle = 0;

      this.flippedX = false;
      this.flippedY = false;

      const rotationSlider = this.imageCaptureDiv.querySelector('.js-rotation-slider');

      this.ensureElementsExist({
        rotationSlider,
      });

      rotationSlider.value = 0;

      this.previousState = {
        transformation: this.cropper.getCropperImage().$getTransform(),
        selection: {
          x: this.cropper.getCropperSelection().x,
          y: this.cropper.getCropperSelection().y,
          width: this.cropper.getCropperSelection().width,
          height: this.cropper.getCropperSelection().height,
        },
        baseRotationAngle: 0,
        offsetRotationAngle: 0,
        flippedX: false,
        flippedY: false,
      };
    }

    async confirmCropRotateChanges() {
      if (!this.cropper) {
        throw new Error('Cropper instance not initialized. Please start crop/rotate first.');
      }

      // Obtain the data URL of the edited image.
      const canvas = await this.cropper.getCropperSelection().$toCanvas();
      const dataUrl = canvas.toDataURL('image/jpeg');

      this.loadCapturePreviewFromDataUrl({
        dataUrl,
        originalCapture: false,
      });

      this.previousState = {
        transformation: this.cropper.getCropperImage().$getTransform(),
        selection: {
          x: this.cropper.getCropperSelection().x,
          y: this.cropper.getCropperSelection().y,
          width: this.cropper.getCropperSelection().width,
          height: this.cropper.getCropperSelection().height,
        },
        baseRotationAngle: this.baseRotationAngle,
        offsetRotationAngle: this.offsetRotationAngle,
        flippedX: this.flippedX,
        flippedY: this.flippedY,
      };

      // Close the crop/rotate container
      this.openContainer('capture-preview');
    }

    cancelCropRotate() {
      if (!this.cropper) {
        throw new Error('Cropper instance not initialized. Please start crop/rotate first.');
      }

      this.cropper.getCropperImage().$setTransform(...this.previousState.transformation);
      this.cropper
        .getCropperSelection()
        .$change(
          this.previousState.selection.x,
          this.previousState.selection.y,
          this.previousState.selection.width,
          this.previousState.selection.height,
        );
      this.cropper.getCropperImage().$center('contain');

      this.baseRotationAngle = this.previousState.baseRotationAngle;
      this.offsetRotationAngle = this.previousState.offsetRotationAngle;

      this.flippedX = this.previousState.flippedX;
      this.flippedY = this.previousState.flippedY;

      const rotationSlider = this.imageCaptureDiv.querySelector('.js-rotation-slider');

      this.ensureElementsExist({
        rotationSlider,
      });

      rotationSlider.value = this.offsetRotationAngle;

      this.openContainer('capture-preview');
    }
  }

  window.PLImageCapture = PLImageCapture;
})();
