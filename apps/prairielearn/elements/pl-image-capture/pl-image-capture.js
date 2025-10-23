/* global QRCode, io, bootstrap, Cropper, Panzoom */

/** Minimum zoom scale for the submitted image preview */
const MIN_ZOOM_SCALE = 1;

/** Maximum zoom scale for the submitted image preview */
const MAX_ZOOM_SCALE = 5;

(() => {
  class PLImageCapture {
    /** @param {string} uuid */
    constructor(uuid) {
      this.uuid = uuid;
      this.imageCaptureDiv = /** @type {HTMLElement | null} */ (
        document.querySelector(`#image-capture-${uuid}`)
      );

      if (!this.imageCaptureDiv) {
        throw new Error(`Image capture element with UUID ${uuid} not found.`);
      }

      const options = JSON.parse(this.imageCaptureDiv.dataset.options || '{}');

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
      this.external_image_capture_available = options.external_image_capture_available;
      this.submitted_file_name = options.submitted_file_name;
      this.submission_files_url = options.submission_files_url;
      this.mobile_capture_enabled = options.mobile_capture_enabled;

      /** Flag representing the current state of the capture before entering crop/zoom */
      this.previousCaptureChangedFlag = false;
      /** @type {{transformation: unknown; selection: {x: number; y: number; width: number; height: number}; baseRotationAngle: number; offsetRotationAngle: number; flippedX: boolean; flippedY: boolean} | null} */
      this.previousCropRotateState = null;
      this.selectedContainerName = 'capture-preview';
      this.handwritingEnhanced = false;

      if (!this.editable) {
        // If the image capture is not editable, only load the most recent submitted image
        // without initializing the image capture functionality.
        void this.loadSubmission();
        this.handwritingEnhancementListeners();
        return;
      }

      if (this.mobile_capture_enabled) {
        this.prepareMobileCaptureButtons();
      }

      this.createLocalCameraCaptureListeners();

      void this.loadSubmission();
      this.createDeletionListeners();

      if (this.mobile_capture_enabled) {
        this.listenForExternalImageCapture();
      }

      this.createCropRotateListeners();
    }

    /**
     * Add the popovers and listeners to the mobile capture buttons in the
     * horizontal and dropdown layouts.
     */
    prepareMobileCaptureButtons() {
      const mobileCaptureButtons = this.getMobileCaptureButtons();

      for (const mobileCaptureButton of mobileCaptureButtons) {
        $(mobileCaptureButton).popover({
          title: 'Capture with mobile device',
          placement: 'auto',
          container: 'body',
          html: true,
          content: `
              <div class="w-100 d-flex flex-column align-items-center">
                ${
                  this.external_image_capture_available
                    ? `
                  <div class="qr-code-${this.uuid} pl-image-capture-qr-code-box mb-3 bg-body-secondary d-flex justify-content-center align-items-center border">
                    <div class="spinning-wheel spinner-border">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </div>
                  <p class="small text-muted mb-0">
                    Scan the QR code with your mobile device to capture an image of your work. 
                  </p>
                `
                    : `
                  <p class="small text-muted mb-0">
                    Mobile device capture is not available in this environment.
                  </p>
                  <p class="small text-muted mb-0 mt-3">
                    It will be available once the question is deployed to production.
                  </p>
                  <p class="small text-muted mb-0 mt-3">
                    For setup instructions to enable mobile capture locally, refer to the 
                    <a href="https://prairielearn.readthedocs.io/en/latest/dev-guide/configJson/#setting-up-external-image-capture-locally" target="_blank">the server configuration guide</a>.
                  </p>
                `
                }
              </div>
            `,
        });
        mobileCaptureButton.addEventListener('inserted.bs.popover', () => {
          this.generateQrCode();
        });
      }
    }

    createLocalCameraCaptureListeners() {
      const localCaptureButtons = this.getUseLocalCaptureButtons();

      const captureLocalCameraImageButton = this.imageCaptureDiv.querySelector(
        '.js-capture-local-camera-image-button',
      );
      const cancelLocalCameraButton = this.imageCaptureDiv.querySelector(
        '.js-cancel-local-camera-button',
      );

      const applyChangesButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-apply-changes-button')
      );

      this.ensureElementsExist({
        captureLocalCameraImageButton,
        cancelLocalCameraButton,
        applyChangesButton,
      });

      for (const localCaptureButton of localCaptureButtons) {
        localCaptureButton.addEventListener('click', () => {
          void this.startLocalCameraCapture();
        });
      }

      if (captureLocalCameraImageButton) {
        captureLocalCameraImageButton.addEventListener('click', () => {
          void this.handleCaptureImage();
        });
      }

      if (cancelLocalCameraButton) {
        cancelLocalCameraButton.addEventListener('click', () => {
          this.cancelLocalCameraCapture();
        });
      }

      applyChangesButton.addEventListener('click', () => {
        void this.confirmCropRotateChanges();
      });
    }

    /** Retrieve the local capture button elements for the horizontal and dropdown layouts. */
    getUseLocalCaptureButtons() {
      return this.imageCaptureDiv.querySelectorAll('.js-capture-with-local-camera-button');
    }

    /** Retrieve the mobile capture button elements for the horizontal and dropdown layouts. */
    getMobileCaptureButtons() {
      if (!this.mobile_capture_enabled) {
        throw new Error('Mobile capture is not enabled, cannot get mobile capture buttons');
      }

      return /** @type {NodeListOf<HTMLElement>} */ (
        this.imageCaptureDiv.querySelectorAll('.js-capture-with-mobile-device-button')
      );
    }

    createCropRotateListeners() {
      /**
       * The cumulative "base" rotation (in degrees) applied by the 90 degree rotate buttons.
       * Changes in +90/-90 degree increments when the user clicks the clockwise or counter-clockwise buttons.
       * @type {number}
       */
      this.baseRotationAngle = 0;

      /**
       * The rotation offset (in degrees) set by the slider.
       * Added to baseRotationAngle to compute the total rotation applied to the image.
       * @type {number}
       */
      this.offsetRotationAngle = 0;

      /** Whether or not the image is flipped horizontally */
      this.flippedX = false;

      /** Whether or not the image is flipped vertically */
      this.flippedY = false;

      const cropRotateButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-crop-rotate-button')
      );
      const rotationSlider = /** @type {HTMLInputElement} */ (
        this.imageCaptureDiv.querySelector('.js-rotation-slider')
      );
      const cancelCropRotateButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-cancel-crop-rotate-button')
      );

      const rotateClockwiseButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-rotate-clockwise-button')
      );
      const rotateCounterclockwiseButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-rotate-counterclockwise-button')
      );

      const flipHorizontalButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-flip-horizontal-button')
      );
      const flipVerticalButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-flip-vertical-button')
      );

      const cropRotateResetButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-crop-rotate-reset-button')
      );

      this.ensureElementsExist({
        cropRotateButton,
        rotationSlider,
        cancelCropRotateButton,
        rotateClockwiseButton,
        rotateCounterclockwiseButton,
        flipHorizontalButton,
        flipVerticalButton,
        cropRotateResetButton,
      });

      // After ensureElementsExist, these are guaranteed to be non-null
      cropRotateButton.addEventListener('click', () => {
        void this.startCropRotate();
      });

      rotationSlider.addEventListener('input', (event) => {
        const target = /** @type {HTMLInputElement} */ (event.target);
        const newRotationAngle = Number.parseFloat(target.value);
        if (Number.isNaN(newRotationAngle)) {
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

      cropRotateResetButton.addEventListener('click', () => {
        this.resetAllCropRotation();
      });
    }

    /** @param {boolean} showDeletionButton */
    setShowDeletionButton(showDeletionButton) {
      const deleteCapturedImageButton = this.imageCaptureDiv.querySelector(
        '.js-delete-captured-image-button',
      );
      this.ensureElementsExist({
        deleteCapturedImageButton,
      });
      /** @type {HTMLElement} */ (deleteCapturedImageButton).classList.toggle(
        'd-none',
        !showDeletionButton,
      );
    }

    confirmImageDeletion() {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );

      this.ensureElementsExist({
        uploadedImageContainer,
      });

      this.loadCapturePreviewFromDataUrl({
        dataUrl: null,
        originalCapture: true,
      });

      this.setNoCaptureAvailableYetState(/** @type {HTMLElement} */ (uploadedImageContainer));

      this.setShowDeletionButton(false);

      this.setCaptureChangedFlag(true);
    }

    createDeletionListeners() {
      const deleteCapturedImageButton = this.imageCaptureDiv.querySelector(
        '.js-delete-captured-image-button',
      );
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );

      this.ensureElementsExist({
        deleteCapturedImageButton,
        uploadedImageContainer,
      });

      const confirmDeletion = () => {
        this.loadCapturePreviewFromDataUrl({
          dataUrl: null,
          originalCapture: true,
        });

        this.setNoCaptureAvailableYetState(/** @type {HTMLElement} */ (uploadedImageContainer));

        this.setShowDeletionButton(false);

        this.setCaptureChangedFlag(true);
      };

      /** @type {HTMLElement} */ (deleteCapturedImageButton).addEventListener(
        'shown.bs.popover',
        () => {
          const confirmDeletionButton = document.querySelector(`#confirm-delete-${this.uuid}`);
          this.ensureElementsExist({
            confirmDeletionButton,
          });
          /** @type {HTMLElement} */ (confirmDeletionButton).addEventListener(
            'click',
            confirmDeletion,
            {
              once: true,
            },
          );
        },
      );

      /** @type {HTMLElement} */ (deleteCapturedImageButton).addEventListener(
        'hide.bs.popover',
        () => {
          const confirmDeletionButton = document.querySelector(`#confirm-delete-${this.uuid}`);
          this.ensureElementsExist({
            confirmDeletionButton,
          });
          /** @type {HTMLElement} */ (confirmDeletionButton).removeEventListener(
            'click',
            confirmDeletion,
          );
        },
      );
    }

    /**
     * Show the specified container within the image capture element and hide all others.
     *
     * @param {string} containerName The name of the container to open. Valid values are:
     * 'capture-preview', 'local-camera-capture', 'crop-rotate'
     */
    openContainer(containerName) {
      if (!['capture-preview', 'local-camera-capture', 'crop-rotate'].includes(containerName)) {
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

      // Displays an interface for cropping and rotating the captured image.
      const cropRotateContainer = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-crop-rotate-container')
      );

      this.ensureElementsExist({
        capturePreviewContainer,
        localCameraCaptureContainer,
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
          name: 'crop-rotate',
          element: cropRotateContainer,
          flex: false,
        },
      ];

      for (const container of containers) {
        if (!container.element) continue;

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

    /**
     * Generate the QR code for external image capture and insert it into
     * any QR code divs associated with the image capture element.
     */
    generateQrCode() {
      if (!this.external_image_capture_url) {
        return;
      }

      const qrCodes = document.querySelectorAll(`.qr-code-${this.uuid}`);
      if (qrCodes.length === 0) {
        throw new Error('QR code element not found.');
      }

      for (const qrCode of qrCodes) {
        // @ts-expect-error - QRCode is a UMD global
        qrCode.innerHTML = new QRCode({
          content: this.external_image_capture_url,
          container: 'svg-viewbox',
        }).svg();
      }
    }

    /**
     * Listen for external image captures submitted from the user's mobile device.
     */
    listenForExternalImageCapture() {
      // @ts-expect-error - io is a UMD global from socket.io-client
      const socket = io('/external-image-capture');
      const questionContainer = /** @type {HTMLElement | null} */ (
        document.querySelector('.question-container')
      );

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
        /** @param {unknown} msg */ (msg) => {
          if (!msg) {
            throw new Error('Failed to join external image capture room');
          }
        },
      );

      socket.on(
        'externalImageCapture',
        /** @param {{ file_content: string }} msg */ (msg) => {
          if (this.selectedContainerName === 'crop-rotate') {
            this.removeCropperChangeListeners();
          }
          this.loadCapturePreview({
            data: msg.file_content,
            type: 'image/jpeg',
          });
          this.setCaptureChangedFlag(true);

          // Acknowledge that the external image capture was received.
          socket.emit(
            'externalImageCaptureAck',
            {
              variant_id: this.variant_id,
              variant_token: questionContainer.dataset.variantToken,
              file_name: this.file_name,
            },
            /** @param {unknown} ackMsg */ (ackMsg) => {
              if (!ackMsg) {
                throw new Error('Failed to acknowledge external image capture');
              }
            },
          );

          const mobileCaptureButtons = this.getMobileCaptureButtons();

          // Dismiss the QR code popover if it is open.
          for (const mobileCaptureButton of mobileCaptureButtons) {
            const popover = bootstrap.Popover.getInstance(mobileCaptureButton);
            if (popover) {
              popover.hide();
            }
          }

          if (this.selectedContainerName !== 'capture-preview') {
            if (this.selectedContainerName === 'crop-rotate') {
              // We discard any pending changes or captured images and show the capture preview, since
              // the user's most recent action was to capture an image externally.
              this.revertToPreviousCropRotateState();
            }
            this.openContainer('capture-preview');
          }
        },
      );
    }

    /**
     * Creates the HTML for the image placeholder div, which is displayed when
     * no image is captured or when the image is loading.
     *
     * @param {string} content The inner HTML of the placeholder div.
     */
    createJsImagePlaceholderDivHtml(content) {
      return `
        <div class="js-image-placeholder bg-body-secondary d-flex justify-content-center align-items-center" style="height: 200px;">
          ${content}
        </div>
      `;
    }

    /**
     * Updates the uploaded image container to display that no image has been captured yet.
     * @param {HTMLElement} uploadedImageContainer
     */
    setNoCaptureAvailableYetState(uploadedImageContainer) {
      const imagePlaceholderDiv = uploadedImageContainer.querySelector('.js-image-placeholder');

      const placeholderMessage = `
        <span class="small text-muted text-center">
          No image captured yet.
          <br/>
          Use a clean sheet of paper.
        </span>
      `;

      if (imagePlaceholderDiv) {
        imagePlaceholderDiv.innerHTML = placeholderMessage;
      } else {
        uploadedImageContainer.innerHTML = this.createJsImagePlaceholderDivHtml(placeholderMessage);
      }
    }

    /**
     * Updates the uploaded image container to display a loading state.
     * @param {HTMLElement} uploadedImageContainer
     */
    setLoadingCaptureState(uploadedImageContainer) {
      uploadedImageContainer.innerHTML = this.createJsImagePlaceholderDivHtml(`
        <div class="spinning-wheel spinner-border">
          <span class="visually-hidden">Loading...</span>
        </div>
      `);
    }

    /**
     * Loads the most recent submission or external image capture.
     */
    async loadSubmission() {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );

      this.ensureElementsExist({
        uploadedImageContainer,
      });

      const uploadedImageContainerElement = /** @type {HTMLElement} */ (uploadedImageContainer);

      this.setLoadingCaptureState(uploadedImageContainerElement);

      if (this.submitted_file_name) {
        if (!this.submission_files_url) {
          this.setNoCaptureAvailableYetState(uploadedImageContainerElement);
          throw new Error('Submission files URL not found');
        }
        const response = await fetch(`${this.submission_files_url}/${this.submitted_file_name}`);

        if (!response.ok) {
          this.setNoCaptureAvailableYetState(uploadedImageContainerElement);
          throw new Error(`Failed to download file: ${response.status}`);
        }

        this.loadCapturePreviewFromBlob(await response.blob());
      } else {
        // No submitted image available, yet
        this.setNoCaptureAvailableYetState(uploadedImageContainerElement);
      }
    }

    /** @param {string} dataUrl */
    setHiddenCaptureInputValue(dataUrl) {
      const hiddenCaptureInput = /** @type {HTMLInputElement} */ (
        this.imageCaptureDiv.querySelector('.js-hidden-capture-input')
      );

      this.ensureElementsExist({
        hiddenCaptureInput,
      });

      const hiddenInput = hiddenCaptureInput;

      if (dataUrl && !hiddenInput.value) {
        this.updateCaptureButtons(true);
      } else if (!dataUrl) {
        this.updateCaptureButtons(false);
      }

      if (dataUrl) {
        hiddenInput.value = dataUrl;
      } else {
        hiddenInput.removeAttribute('value');
      }
    }

    /**
     * Update the capture button layout and text based on if the user is retaking the image.
     *
     * @param {boolean} isRetaking - Whether the user is retaking the image.
     */
    updateCaptureButtons(isRetaking) {
      if (this.mobile_capture_enabled) {
        const captureButtonsHorizontalDiv = this.imageCaptureDiv.querySelector(
          '.js-capture-buttons-horizontal',
        );
        const captureButtonsDropdownDiv = this.imageCaptureDiv.querySelector(
          '.js-capture-buttons-dropdown',
        );

        this.ensureElementsExist({
          captureButtonsHorizontalDiv,
          captureButtonsDropdownDiv,
        });

        const horizontalDiv = /** @type {HTMLElement} */ (captureButtonsHorizontalDiv);
        const dropdownDiv = /** @type {HTMLElement} */ (captureButtonsDropdownDiv);

        if (isRetaking) {
          horizontalDiv.classList.replace('d-flex', 'd-none');
        } else {
          horizontalDiv.classList.replace('d-none', 'd-flex');
        }
        dropdownDiv.classList.toggle('d-none', !isRetaking);
      } else {
        const captureWithLocalCameraButtonHorizontalSpan = this.imageCaptureDiv.querySelector(
          '.js-capture-buttons-horizontal .js-capture-with-local-camera-button span',
        );
        this.ensureElementsExist({
          captureWithLocalCameraButtonHorizontalSpan,
        });
        /** @type {HTMLElement} */ (captureWithLocalCameraButtonHorizontalSpan).innerHTML =
          isRetaking ? 'Retake with webcam' : 'Use webcam';
      }
    }

    /**
     * Sets the hidden capture input value to the capture preview, which is the last
     * image that was ready for submission.
     */
    setHiddenCaptureInputToCapturePreview() {
      const capturePreviewImg = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container .pl-image-capture-preview',
      );

      this.setHiddenCaptureInputValue(
        capturePreviewImg ? /** @type {HTMLImageElement} */ (capturePreviewImg).src : '',
      );
    }

    /** @param {{ dataUrl: string | null; originalCapture?: boolean }} params */
    loadCapturePreviewFromDataUrl({ dataUrl, originalCapture = true }) {
      const uploadedImageContainer = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container',
      );

      this.ensureElementsExist({
        uploadedImageContainer,
      });

      const uploadedImageContainerElement = /** @type {HTMLElement} */ (uploadedImageContainer);

      const capturePreview = document.createElement('img');
      capturePreview.className = 'pl-image-capture-preview img-fluid bg-body-secondary w-100';

      if (dataUrl) {
        capturePreview.src = dataUrl;
      } else {
        capturePreview.removeAttribute('src');
      }
      capturePreview.alt = 'Captured image preview';

      const capturePreviewParent = document.createElement('div');
      capturePreviewParent.className = 'js-capture-preview-div bg-body-secondary';

      capturePreviewParent.append(capturePreview);

      uploadedImageContainerElement.innerHTML = '';
      uploadedImageContainerElement.append(capturePreviewParent);

      if (originalCapture) {
        capturePreview.addEventListener(
          'load',
          () => {
            this.capturePreviewHeight = capturePreview.clientHeight;
          },
          { once: true },
        );
      }

      if (this.editable) {
        this.setShowDeletionButton(dataUrl ? true : false);
      } else {
        const zoomButtonsContainer = /** @type {HTMLElement} */ (
          this.imageCaptureDiv.querySelector('.js-zoom-buttons')
        );
        const viewerRotateClockwiseButton = /** @type {HTMLElement} */ (
          this.imageCaptureDiv.querySelector('.js-viewer-rotate-clockwise-button')
        );

        const zoomInButton = /** @type {HTMLElement} */ (
          this.imageCaptureDiv.querySelector('.js-zoom-in-button')
        );
        const zoomOutButton = /** @type {HTMLElement} */ (
          this.imageCaptureDiv.querySelector('.js-zoom-out-button')
        );

        this.ensureElementsExist({
          zoomButtonsContainer,
          viewerRotateClockwiseButton,
          zoomInButton,
          zoomOutButton,
        });

        const zoomButtonsContainerElement = /** @type {HTMLElement} */ (zoomButtonsContainer);
        const zoomInButtonElement = /** @type {HTMLElement} */ (zoomInButton);
        const zoomOutButtonElement = /** @type {HTMLElement} */ (zoomOutButton);
        const rotateButtonElement = /** @type {HTMLElement} */ (viewerRotateClockwiseButton);

        // Display the zoom buttons only when the image is not editable to
        // prevent confusion with crop/rotate functionality, which is
        // available when the image is editable.
        zoomButtonsContainerElement.classList.remove('d-none');

        if (!this.imageCapturePreviewPanzoom) {
          // Initialize Panzoom on the parent of the captured image element, since
          // the image itself may be rotated.
          this.imageCapturePreviewPanzoom = Panzoom(capturePreviewParent, {
            contain: 'outside',
            minScale: MIN_ZOOM_SCALE,
            maxScale: MAX_ZOOM_SCALE,
          });

          zoomInButtonElement.addEventListener('click', () => {
            this.imageCapturePreviewPanzoom?.zoomIn();
          });
          zoomOutButtonElement.addEventListener('click', () => {
            this.imageCapturePreviewPanzoom?.zoomOut();
          });

          let rotation = 0;
          rotateButtonElement.addEventListener('click', () => {
            const capturePreviewImg = this.imageCaptureDiv.querySelector(
              '.js-uploaded-image-container .pl-image-capture-preview',
            );

            this.ensureElementsExist({
              capturePreviewImg,
            });

            const capturePreviewImgElement = /** @type {HTMLElement} */ (capturePreviewImg);

            // The capture preview image always fills the entire height.
            const photoHeight = capturePreviewImgElement.clientHeight;

            // Compute the width of the capture preview image excluding any side
            // whitespace coming from the max-height: 600px constraint.
            const capturePreviewImgEl = /** @type {HTMLImageElement} */ (capturePreviewImg);
            const photoWidth =
              photoHeight * (capturePreviewImgEl.naturalWidth / capturePreviewImgEl.naturalHeight);

            const clientHeight = capturePreviewImgElement.clientHeight;
            const clientWidth = capturePreviewImgElement.clientWidth;

            // Rotation is strictly increasing so that the rotation animation is always in the same direction.
            rotation += 90;

            // Compute the scale factor based on the rotation.
            // - If image is parallel to the capture preview div, reset its scaling to 1.
            // - If image is perpendicular to the capture preview div, scale it so its longest side
            //   fits within the preview container without clipping.
            const scaleFactor =
              rotation % 180 === 0
                ? 1
                : Math.min(clientHeight / photoWidth, clientWidth / photoHeight);

            capturePreviewImgElement.style.transform = `rotate(${rotation}deg) scale(${scaleFactor})`;
            // @ts-expect-error - Panzoom type definitions are incomplete
            this.imageCapturePreviewPanzoom?.reset({ animate: true });
          });

          let panEnabled = false;
          capturePreview.addEventListener('panzoomzoom', (e) => {
            const scale = /** @type {{ detail: { scale: number } }} */ (/** @type {unknown} */ (e))
              .detail.scale;

            panEnabled = scale > 1;

            // We only indicate that panning is available when the image is zoomed in.
            // Panzoom has an option called panOnlyWhenZoomed, but it does not update the cursor.
            capturePreview.style.cursor = panEnabled ? 'grab' : 'default';

            if (scale === MIN_ZOOM_SCALE) {
              zoomOutButtonElement.classList.add('disabled', 'opacity-10');
            } else {
              zoomOutButtonElement.classList.remove('disabled', 'opacity-10');
            }

            if (scale >= MAX_ZOOM_SCALE) {
              zoomInButtonElement.classList.add('disabled', 'opacity-10');
            } else {
              zoomInButtonElement.classList.remove('disabled', 'opacity-10');
            }
          });

          capturePreview.addEventListener('panzoomstart', () => {
            if (panEnabled) {
              capturePreview.style.cursor = 'grabbing';
            }
          });

          capturePreview.addEventListener('panzoomend', () => {
            if (panEnabled) {
              capturePreview.style.cursor = 'grab';
            }
          });
        } else {
          // @ts-expect-error - Panzoom type definitions are incomplete
          this.imageCapturePreviewPanzoom.reset({ animate: false });
        }
      }

      if (this.editable) {
        this.setHiddenCaptureInputValue(dataUrl ?? '');

        if (originalCapture) {
          const hiddenOriginalCaptureInput = this.imageCaptureDiv.querySelector(
            '.js-hidden-original-capture-input',
          );

          this.ensureElementsExist({
            hiddenOriginalCaptureInput,
          });

          const hiddenOriginalInput = /** @type {HTMLInputElement} */ (hiddenOriginalCaptureInput);

          if (dataUrl) {
            hiddenOriginalInput.value = dataUrl;
          } else {
            hiddenOriginalInput.removeAttribute('value');
          }
          if (this.cropper) {
            this.resetCropRotateInterfaceState();
          }
        }

        this.setShowCropRotateButton(dataUrl ? true : false);
      }
    }

    /** @param {Blob} blob */
    loadCapturePreviewFromBlob(blob) {
      const reader = new FileReader();
      reader.onload = (event) => {
        this.loadCapturePreviewFromDataUrl({
          dataUrl: /** @type {string} */ (event.target?.result),
        });
      };
      reader.readAsDataURL(blob);
    }

    /** @param {{ data: string; type: string }} params */
    loadCapturePreview({ data, type }) {
      this.loadCapturePreviewFromDataUrl({ dataUrl: `data:${type};base64,${data}` });
    }

    /**
     * Updates the hidden capture changed flag, ensuring that users receive an unsaved changes
     * warning if they attempt to leave the question without saving.
     *
     * This flag is not included in the submission data; it is used solely by the question
     * unload event handler to detect unsaved edits to the image (e.g., after
     * capturing, cropping, or rotating).
     * @param {boolean} value
     */
    setCaptureChangedFlag(value) {
      const hiddenCaptureChangedFlag = this.imageCaptureDiv.querySelector(
        '.js-hidden-capture-changed-flag',
      );
      this.ensureElementsExist({
        hiddenCaptureChangedFlag,
      });

      const hiddenFlagInput = /** @type {HTMLInputElement} */ (hiddenCaptureChangedFlag);

      hiddenFlagInput.value = String(value);

      // Disable the flag if no changes have been made.
      hiddenFlagInput.disabled = !value;
    }

    async startLocalCameraCapture() {
      const capturePreviewContainer = this.imageCaptureDiv.querySelector(
        '.js-capture-preview-container',
      );
      const localCameraCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-capture-container',
      );
      const localCameraErrorMessage = /** @type {HTMLElement | null} */ (
        localCameraCaptureContainer?.querySelector('.js-local-camera-error-message')
      );

      const localCameraVideo = /** @type {HTMLVideoElement} */ (
        this.imageCaptureDiv.querySelector('.js-local-camera-video')
      );

      const localCameraInstructions = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-local-camera-instructions')
      );

      this.ensureElementsExist({
        capturePreviewContainer,
        localCameraCaptureContainer,
        localCameraErrorMessage,
        localCameraVideo,
        localCameraInstructions,
      });

      const localCameraErrorMessageElement = /** @type {HTMLElement} */ (localCameraErrorMessage);
      const localCameraVideoElement = /** @type {HTMLVideoElement} */ (localCameraVideo);
      const localCameraInstructionsElement = /** @type {HTMLElement} */ (localCameraInstructions);

      this.openContainer('local-camera-capture');

      localCameraErrorMessageElement.classList.add('d-none');

      try {
        // Stream the local camera video to the video element
        this.localCameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 2000 },
            height: { ideal: 2000 },
          },
        });
        localCameraVideoElement.srcObject = this.localCameraStream;

        await localCameraVideoElement.play();

        const captureLocalCameraImageButton = this.imageCaptureDiv.querySelector(
          '.js-capture-local-camera-image-button',
        );

        if (captureLocalCameraImageButton) {
          // Allow the user to capture an image
          captureLocalCameraImageButton.removeAttribute('disabled');
          localCameraInstructionsElement.classList.remove('d-none');
        } else {
          throw new Error('Capture image button not found');
        }
      } catch (err) {
        localCameraErrorMessageElement.classList.remove('d-none');
        localCameraInstructionsElement.classList.add('d-none');

        const error = /** @type {{ name?: string; message?: string }} */ (err);

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          localCameraErrorMessageElement.textContent =
            'Give permission to access your camera to capture an image.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          localCameraErrorMessageElement.textContent =
            'No camera found. Please connect a camera to your device.';
        } else {
          localCameraErrorMessageElement.textContent =
            'An error occurred while trying to access your camera.';
        }
        throw new Error('Could not start local camera: ' + (error.message || 'Unknown error'));
      }
    }

    deactivateVideoStream() {
      const localCameraVideo = /** @type {HTMLVideoElement} */ (
        this.imageCaptureDiv.querySelector('.js-local-camera-video')
      );
      const captureLocalCameraImageButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-capture-local-camera-image-button')
      );

      this.ensureElementsExist({
        localCameraVideo,
        captureLocalCameraImageButton,
      });

      const localCameraVideoElement = /** @type {HTMLVideoElement} */ (localCameraVideo);
      const captureButton = /** @type {HTMLElement} */ (captureLocalCameraImageButton);

      if (this.localCameraStream) {
        this.localCameraStream.getTracks().forEach((track) => track.stop());
        this.localCameraStream = null;
      }

      localCameraVideoElement.srcObject = null;
      localCameraVideoElement.pause();

      // Prevent the user from capturing another image until the local camera is restarted.
      captureButton.setAttribute('disabled', 'disabled');
    }

    handleCaptureImage() {
      const localCameraCaptureContainer = this.imageCaptureDiv.querySelector(
        '.js-local-camera-capture-container',
      );
      const localCameraImagePreviewCanvas = /** @type {HTMLCanvasElement | null} */ (
        localCameraCaptureContainer?.querySelector('.js-local-camera-image-preview')
      );
      const localCameraVideo = /** @type {HTMLVideoElement | null} */ (
        localCameraCaptureContainer?.querySelector('.js-local-camera-video')
      );
      const hiddenCaptureInput = /** @type {HTMLInputElement} */ (
        this.imageCaptureDiv.querySelector('.js-hidden-capture-input')
      );

      this.ensureElementsExist({
        localCameraCaptureContainer,
        localCameraImagePreviewCanvas,
        localCameraVideo,
        hiddenCaptureInput,
      });

      const canvas = /** @type {HTMLCanvasElement} */ (localCameraImagePreviewCanvas);
      const video = /** @type {HTMLVideoElement} */ (localCameraVideo);

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      this.deactivateVideoStream();
      this.loadCapturePreviewFromDataUrl({
        dataUrl: canvas.toDataURL('image/jpeg'),
      });
      this.setCaptureChangedFlag(true);
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

      const localCameraErrorMessageElement = /** @type {HTMLElement} */ (localCameraErrorMessage);

      this.openContainer('capture-preview');
      this.setHiddenCaptureInputToCapturePreview();

      localCameraErrorMessageElement.classList.add('d-none');

      this.deactivateVideoStream();
    }

    /**
     * Ensures that the provided elements exist. Throws an error if any element is not present.
     * @param {Record<string, Element | null | undefined>} elements An object wherein keys are element names and values are the elements.
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

    /**
     * Ensures that the cropper instance exists. Throws an error if not.
     */
    ensureCropperExists() {
      if (!this.cropper) {
        throw new Error('Cropper instance not initialized. Please start crop/rotate first.');
      }
    }

    /**
     * Set if the crop rotate button is shown or not.
     *
     * @param {boolean} show If true, shows the crop rotate button. Otherwise, hides it.
     */
    setShowCropRotateButton(show) {
      const cropRotateButton = /** @type {HTMLElement} */ (
        this.imageCaptureDiv.querySelector('.js-crop-rotate-button')
      );

      this.ensureElementsExist({
        cropRotateButton,
      });
      cropRotateButton.classList.toggle('d-none', !show);
    }

    startCropRotate() {
      const hiddenCaptureChangedFlag = this.imageCaptureDiv.querySelector(
        '.js-hidden-capture-changed-flag',
      );
      this.ensureElementsExist({
        hiddenCaptureChangedFlag,
      });

      const hiddenFlagInput = /** @type {HTMLInputElement} */ (hiddenCaptureChangedFlag);

      this.previousCaptureChangedFlag = hiddenFlagInput.value === 'true';

      // To simplify this logic, we assume that the user will make changes if they are in the crop/rotate interface.
      this.setCaptureChangedFlag(true);

      this.openContainer('crop-rotate');

      if (!this.cropper) {
        // Used by CropperJS to initialize the cropper instance.
        const cropperImage = this.imageCaptureDiv.querySelector('.js-cropper-base-image');
        const hiddenOriginalInput = this.imageCaptureDiv.querySelector(
          '.js-hidden-original-capture-input',
        );
        this.ensureElementsExist({
          cropperImage,
          hiddenOriginalInput,
        });

        const cropperImageElement = /** @type {HTMLImageElement} */ (cropperImage);
        const hiddenOriginalInputElement = /** @type {HTMLInputElement} */ (hiddenOriginalInput);

        cropperImageElement.src = hiddenOriginalInputElement.value;

        // @ts-expect-error - Cropper is a UMD global
        this.cropper = new Cropper.default(
          `#image-capture-${this.uuid} .js-cropper-container .js-cropper-base-image`,
        );

        // Disable zooming with the mouse wheel.
        this.cropper.getCropperCanvas().scaleStep = 0;
      } else {
        // If the cropper already exists, update its image source to the original capture.
        const hiddenOriginalInput = this.imageCaptureDiv.querySelector(
          '.js-hidden-original-capture-input',
        );
        this.ensureElementsExist({
          hiddenOriginalInput,
        });
        const hiddenOriginalInputElement = /** @type {HTMLInputElement} */ (hiddenOriginalInput);
        this.cropper.getCropperImage().src = hiddenOriginalInputElement.value;
      }

      const cropperHandle = this.imageCaptureDiv.querySelector(
        '.js-cropper-container cropper-handle[action="move"]',
      );
      const cropperCanvas = this.cropper.getCropperCanvas();

      this.ensureElementsExist({
        cropperHandle,
        cropperCanvas,
      });

      const cropperHandleElement = /** @type {HTMLElement} */ (cropperHandle);
      const cropperCanvasElement = /** @type {HTMLElement} */ (cropperCanvas);

      if (!this.capturePreviewHeight) {
        throw new Error(
          'Capture preview height not set. Please ensure the capture preview image is loaded before starting crop/rotate.',
        );
      }
      cropperCanvasElement.style.height = this.capturePreviewHeight + 'px';
      cropperHandleElement.setAttribute('theme-color', 'rgba(0, 0, 0, 0)');

      this.addCropperChangeListeners();
    }

    /**
     * When the cropper selection changes or the image is transformed (rotated, flipped, etc.),
     * saves the current cropper selection to the hidden input field.
     *
     * This ensures that if the user crops, rotates, or flips the image and submits before
     * applying changes, the changes are present in the saved image.
     */
    addCropperChangeListeners() {
      this.ensureCropperExists();

      const cropperSelection = this.cropper.getCropperSelection();
      const cropperImage = this.cropper.getCropperImage();

      this.ensureElementsExist({
        cropperSelection,
        cropperImage,
      });
      // Store references to the listener functions for proper removal
      this.cropperSelectionChangeHandler = () => {
        void this.saveCropperSelectionToHiddenInput();
      };
      this.cropperImageTransformHandler = () => {
        void this.saveCropperSelectionToHiddenInput();
      };

      // Handles changes to the cropping of the image.
      cropperSelection.addEventListener('change', this.cropperSelectionChangeHandler);

      // Handles rotation and flipping of the image.
      cropperImage.addEventListener('transform', this.cropperImageTransformHandler);
    }

    /** Remove the cropper change listeners that update the hidden input field. */
    removeCropperChangeListeners() {
      this.ensureCropperExists();

      const cropperSelection = this.cropper.getCropperSelection();
      const cropperImage = this.cropper.getCropperImage();

      this.ensureElementsExist({
        cropperSelection,
        cropperImage,
      });

      cropperSelection.removeEventListener('change', this.cropperSelectionChangeHandler);

      cropperImage.removeEventListener('transform', this.cropperImageTransformHandler);
    }

    /**
     * Sets the rotation offset angle for the cropper image.
     * This angle is added to the base rotation angle to calculate the total rotation angle.
     * @param {number} offsetRotationAngle The offset rotation angle in degrees.
     */
    setRotationOffset(offsetRotationAngle) {
      this.ensureCropperExists();

      this.offsetRotationAngle = offsetRotationAngle;
      this.updateImageRotationAngle();
    }

    /**
     * Rotates the image by 90 degrees clockwise or counterclockwise.
     * @param {boolean} clockwise If true, rotates the image 90 degrees clockwise.
     * If false, rotates it 90 degrees counterclockwise.
     */
    handleRotate90Degrees(clockwise) {
      this.ensureCropperExists();

      this.baseRotationAngle = (this.baseRotationAngle ?? 0) + (clockwise ? 90 : -90);
      this.updateImageRotationAngle();
    }

    /**
     * Flips the image horizontally or vertically.
     * @param {boolean} horizontal If true, flips the image horizontally. If false, flips it vertically.
     */
    handleFlip(horizontal) {
      this.ensureCropperExists();

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
      const image = this.cropper.getCropperImage();
      const transform = image.$getTransform();
      if (!transform) {
        throw new Error('Cropper image transform not found. Please start crop/rotate first.');
      }

      const totalRotationAngle = (this.baseRotationAngle ?? 0) + (this.offsetRotationAngle ?? 0);
      const rotationAngleRad = (totalRotationAngle * Math.PI) / 180;

      const cos = Math.cos(rotationAngleRad);
      const sin = Math.sin(rotationAngleRad);

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

    /**
     * Resets the cropper selection, rotation amount, and flip states without
     * affecting the actual transformations applied to the captured image.
     */
    resetCropRotateInterfaceState() {
      this.ensureCropperExists();

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

      /** @type {HTMLInputElement} */ (rotationSlider).value = '0';

      const selection = this.cropper.getCropperSelection();
      /** @type {{transformation: unknown; selection: {x: number; y: number; width: number; height: number}; baseRotationAngle: number; offsetRotationAngle: number; flippedX: boolean; flippedY: boolean}} */
      const previousState = {
        transformation: this.cropper.getCropperImage().$getTransform(),
        selection: {
          x: selection.x,
          y: selection.y,
          width: selection.width,
          height: selection.height,
        },
        baseRotationAngle: 0,
        offsetRotationAngle: 0,
        flippedX: false,
        flippedY: false,
      };
      this.previousCropRotateState = previousState;
    }

    /**
     * Resets the crop/rotation interface state and any transformations applied to the image.
     */
    resetAllCropRotation() {
      const hiddenOriginalCaptureInput = this.imageCaptureDiv.querySelector(
        '.js-hidden-original-capture-input',
      );

      this.ensureElementsExist({
        hiddenOriginalCaptureInput,
      });

      const hiddenOriginalInput = /** @type {HTMLInputElement} */ (hiddenOriginalCaptureInput);

      this.previousCropRotateState = null;

      this.cancelCropRotate(false);

      this.loadCapturePreviewFromDataUrl({
        dataUrl: hiddenOriginalInput.value,
        originalCapture: false,
      });
    }

    /** @type {ReturnType<typeof setTimeout> | null} */
    timeoutId = null;

    /**
     * Helper function for saveCropperSelectionToHiddenInput to implement debounce.
     * Do not use this function; use saveCropperSelectionToHiddenInput instead.
     */
    async saveCropperSelectionToHiddenInputHelper() {
      this.ensureCropperExists();
      // Obtain the data URL of the image selection.
      const selection = this.cropper.getCropperSelection();
      let dataUrl;
      try {
        const canvas = await selection.$toCanvas();
        dataUrl = canvas.toDataURL('image/jpeg');
      } catch {
        throw new Error('Failed to convert cropper selection to canvas');
      }

      this.setHiddenCaptureInputValue(dataUrl);
    }

    /**
     * Saves the current crop and rotation changes to the hidden input field.
     * Ensures that pending crop/rotate changes or image captures are saved if the user
     * submits without confirming them.
     *
     * Debounced by 200ms to avoid excessive updates while the user is making changes.
     */
    saveCropperSelectionToHiddenInput() {
      if (this.selectedContainerName !== 'crop-rotate') {
        return;
      }

      if (this.timeoutId) clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => {
        void this.saveCropperSelectionToHiddenInputHelper();
      }, 200);
    }

    async confirmCropRotateChanges() {
      this.ensureCropperExists();

      // Obtain the data URL of the image selection.
      const selection = this.cropper.getCropperSelection();
      let dataUrl;
      try {
        const canvas = await selection.$toCanvas();
        dataUrl = canvas.toDataURL('image/jpeg');
      } catch {
        throw new Error('Failed to convert cropper selection to canvas');
      }

      this.loadCapturePreviewFromDataUrl({
        dataUrl,
        originalCapture: false,
      });

      this.previousCropRotateState = {
        transformation: this.cropper.getCropperImage().$getTransform(),
        selection: {
          x: selection.x,
          y: selection.y,
          width: selection.width,
          height: selection.height,
        },
        baseRotationAngle: this.baseRotationAngle ?? 0,
        offsetRotationAngle: this.offsetRotationAngle ?? 0,
        flippedX: this.flippedX ?? false,
        flippedY: this.flippedY ?? false,
      };

      this.removeCropperChangeListeners();

      this.openContainer('capture-preview');
    }

    revertToPreviousCropRotateState() {
      this.ensureCropperExists();

      if (!this.previousCropRotateState) {
        this.resetCropRotateInterfaceState();
        return;
      }

      this.cropper
        .getCropperImage()
        .$setTransform(
          .../** @type {[unknown, unknown, unknown, unknown, unknown, unknown]} */ (
            this.previousCropRotateState.transformation
          ),
        );

      this.cropper
        .getCropperSelection()
        .$change(
          this.previousCropRotateState.selection.x,
          this.previousCropRotateState.selection.y,
          this.previousCropRotateState.selection.width,
          this.previousCropRotateState.selection.height,
        );
      this.cropper.getCropperImage().$center('contain');

      this.baseRotationAngle = this.previousCropRotateState.baseRotationAngle;
      this.offsetRotationAngle = this.previousCropRotateState.offsetRotationAngle;

      this.flippedX = this.previousCropRotateState.flippedX;
      this.flippedY = this.previousCropRotateState.flippedY;

      const rotationSlider = this.imageCaptureDiv.querySelector('.js-rotation-slider');

      this.ensureElementsExist({
        rotationSlider,
      });

      /** @type {HTMLInputElement} */ (rotationSlider).value = String(
        this.offsetRotationAngle || 0,
      );
    }

    cancelCropRotate(revertToLastImage = true) {
      this.ensureCropperExists();

      this.removeCropperChangeListeners();

      // Clear any pending debounced crop/rotate changes that would be saved
      if (this.timeoutId) clearTimeout(this.timeoutId);
      this.timeoutId = null;

      this.revertToPreviousCropRotateState();

      this.openContainer('capture-preview');
      if (revertToLastImage) {
        this.setHiddenCaptureInputToCapturePreview();
      }

      // Restore the previous hidden capture changed flag value.
      // Needed for the case that the user had no changes before starting crop/rotate.
      this.setCaptureChangedFlag(this.previousCaptureChangedFlag);
    }

    /**
     * Enhances handwriting in the captured image by applying black-and-white and contrast filters.
     */
    enhanceHandwriting() {
      if (this.editable) {
        throw new Error('Handwriting enhancement is not allowed if pl-image-capture is editable.');
      }

      const capturePreview = this.imageCaptureDiv.querySelector(
        '.js-uploaded-image-container .pl-image-capture-preview',
      );

      this.ensureElementsExist({
        capturePreview,
      });

      const capturePreviewElement = /** @type {HTMLElement} */ (capturePreview);

      if (this.handwritingEnhanced) {
        capturePreviewElement.style.filter = '';
        this.handwritingEnhanced = false;
      } else {
        capturePreviewElement.style.filter = 'grayscale(1) contrast(2)';
        this.handwritingEnhanced = true;
      }
    }

    handwritingEnhancementListeners() {
      const enhanceHandwritingButton = this.imageCaptureDiv.querySelector(
        '.js-enhance-handwriting-button',
      );

      this.ensureElementsExist({
        enhanceHandwritingButton,
      });

      /** @type {HTMLElement} */ (enhanceHandwritingButton).addEventListener('click', () => {
        void this.enhanceHandwriting();
      });
    }
  }

  // @ts-expect-error - enhanceImage method may be added in the future
  window.PLImageCapture = PLImageCapture;
})();
