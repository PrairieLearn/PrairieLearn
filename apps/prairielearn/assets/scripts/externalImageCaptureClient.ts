import { io } from 'socket.io-client';

import { onDocumentReady } from '@prairielearn/browser-utils';

import type { StatusMessage } from '../../src/lib/externalImageCaptureSocket.types.js';

const MAX_IMAGE_SIDE_LENGTH = 1000;
const SOCKET_TIMEOUT_MS = 10 * 1000; // 10 seconds

onDocumentReady(() => {
  const cameraInput = document.querySelector<HTMLInputElement>('#camera-input');
  const cameraInputLabelSpan = document.querySelector<HTMLLabelElement>(
    'label[for="camera-input"] span',
  );
  const uploadButton = document.querySelector<HTMLButtonElement>('#upload-button');
  const imagePreview = document.querySelector<HTMLImageElement>('#image-preview');
  const externalImageCaptureForm = document.querySelector<HTMLFormElement>(
    '#external-image-capture-form',
  );
  const tryAgainButton = document.querySelector<HTMLButtonElement>('#try-again-button');

  let resizingCanvas: HTMLCanvasElement | null = null;
  let resizingCtx: CanvasRenderingContext2D | null = null;

  if (
    !cameraInput ||
    !cameraInputLabelSpan ||
    !uploadButton ||
    !imagePreview ||
    !externalImageCaptureForm ||
    !tryAgainButton
  ) {
    throw new Error('Required elements not found in the document');
  }

  const socket = io('/external-image-capture');
  const timeout = setTimeout(() => {
    changeState('failed');
    socket.disconnect();
  }, SOCKET_TIMEOUT_MS);

  socket.emit(
    'joinExternalImageCapture',
    {
      variant_id: externalImageCaptureForm.dataset.variantId,
      variant_token: externalImageCaptureForm.dataset.variantToken,
      file_name: externalImageCaptureForm.dataset.fileName,
    },
    (msg: StatusMessage) => {
      if (!msg) {
        changeState('failed');
        throw new Error('Failed to join external image capture room');
      }
      clearTimeout(timeout);
      changeState('form');
    },
  );

  function changeState(state: 'loading' | 'form' | 'uploading' | 'success' | 'failed') {
    const externalImageCaptureLoadingContainer = document.querySelector<HTMLDivElement>(
      '#external-image-capture-loading-container',
    );
    const externalImageCaptureUploadingContainer = document.querySelector<HTMLDivElement>(
      '#external-image-capture-uploading-container',
    );
    const externalImageCaptureFormContainer = document.querySelector<HTMLDivElement>(
      '#external-image-capture-form-container',
    );
    const formItems =
      externalImageCaptureFormContainer?.querySelector<HTMLDivElement>('#form-items');
    const externalImageCaptureSuccessContainer = document.querySelector<HTMLDivElement>(
      '#external-image-capture-success-container',
    );
    const externalImageCaptureFailedContainer = document.querySelector<HTMLDivElement>(
      '#external-image-capture-failed-container',
    );
    const uploadButton = document.querySelector<HTMLButtonElement>('#upload-button');
    const uploadButtonSpan = document.querySelector<HTMLButtonElement>('#upload-button span');

    // Button that opens the user's camera, allowing them to capture an image.
    const cameraInputLabel = document.querySelector<HTMLLabelElement>('label[for="camera-input"]');

    if (
      !externalImageCaptureLoadingContainer ||
      !externalImageCaptureUploadingContainer ||
      !externalImageCaptureFormContainer ||
      !formItems ||
      !externalImageCaptureSuccessContainer ||
      !externalImageCaptureFailedContainer ||
      !tryAgainButton ||
      !uploadButtonSpan ||
      !uploadButton ||
      !cameraInputLabel ||
      !cameraInputLabelSpan
    ) {
      throw new Error('Required elements for changing state not found in the document');
    }

    if (state === 'form') {
      externalImageCaptureFormContainer.classList.remove('d-none');
      formItems.classList.remove('d-none');

      const imageUploaded = cameraInput?.files && cameraInput.files.length > 0;
      if (imageUploaded) {
        uploadButton.classList.remove('d-none');
      }

      cameraInputLabel.classList.remove('d-none');
    } else {
      externalImageCaptureFormContainer.classList.add('d-none');
    }

    if (state === 'loading') {
      externalImageCaptureLoadingContainer.classList.replace('d-none', 'd-flex');
    } else {
      externalImageCaptureLoadingContainer.classList.replace('d-flex', 'd-none');
    }

    if (state === 'uploading') {
      externalImageCaptureUploadingContainer.classList.replace('d-none', 'd-flex');
    } else {
      externalImageCaptureUploadingContainer.classList.replace('d-flex', 'd-none');
    }

    if (state === 'success') {
      externalImageCaptureSuccessContainer.classList.remove('d-none');
      externalImageCaptureFormContainer.classList.remove('d-none');

      formItems.classList.add('d-none');
      uploadButton.classList.add('d-none');
    } else {
      externalImageCaptureSuccessContainer.classList.add('d-none');
    }

    if (state === 'failed') {
      externalImageCaptureFailedContainer.classList.remove('d-none');
      externalImageCaptureFormContainer.classList.remove('d-none');
      formItems.classList.add('d-none');

      tryAgainButton.classList.remove('d-none');

      uploadButton.classList.add('d-none');
      uploadButtonSpan.textContent = 'Reupload';

      cameraInputLabel.classList.add('d-none');
    } else {
      externalImageCaptureFailedContainer.classList.add('d-none');
      tryAgainButton.classList.add('d-none');
      if (state !== 'success') {
        formItems.classList.remove('d-none');
      }
    }
  }

  function displayImagePreview(dataUrl: string) {
    if (!imagePreview || !uploadButton || !cameraInputLabelSpan) {
      throw new Error(
        'Required elements for displaying an image preview not found in the document',
      );
    }
    imagePreview.src = dataUrl;
    imagePreview.style.display = 'block';

    uploadButton.disabled = false;
    uploadButton.classList.remove('d-none');
    cameraInputLabelSpan.textContent = 'Retake photo';
  }

  function listenForImageCaptureAcknowledgement() {
    if (!externalImageCaptureForm) {
      throw new Error('External image capture form not found in the document');
    }

    const timeout = setTimeout(() => {
      changeState('failed');
      socket.disconnect();
    }, SOCKET_TIMEOUT_MS);

    socket.on('externalImageCaptureAck', (msg: StatusMessage) => {
      clearTimeout(timeout);
      socket.disconnect();

      if (!msg) {
        changeState('failed');
        throw new Error('Failed to receive external image capture acknowledgement');
      }

      changeState('success');
    });
  }

  cameraInput.addEventListener('change', () => {
    cameraInput.disabled = false;

    if (!cameraInput.files || cameraInput.files.length === 0) {
      // The user cannot submit if no file was uploaded.
      uploadButton.classList.add('d-none');
      uploadButton.disabled = true;
      return;
    }

    // Select the image the user uploaded.
    const file = cameraInput.files[0];
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.src = url;

    image.onload = () => {
      // Perform scaling to ensure that user-uploaded images are not too large.
      // The scale factor ensures that the width and height of the image do not exceed 1000px.
      // If the image width and height are both less than 1000px, no scaling is applied.
      const imageScaleFactor = MAX_IMAGE_SIDE_LENGTH / Math.max(image.width, image.height);

      if (imageScaleFactor >= 1) {
        // No scaling is necessary, so we can directly use the original image.
        displayImagePreview(url);
        return;
      }

      const targetWidth = Math.round(image.width * imageScaleFactor);
      const targetHeight = Math.round(image.height * imageScaleFactor);

      if (!resizingCanvas) {
        resizingCanvas = document.createElement('canvas');
      }
      if (!resizingCtx) {
        resizingCtx = resizingCanvas.getContext('2d');
        if (!resizingCtx) {
          throw new Error('Failed to get canvas context');
        }
      }

      resizingCanvas.width = targetWidth;
      resizingCanvas.height = targetHeight;
      resizingCtx.drawImage(image, 0, 0, targetWidth, targetHeight);

      resizingCanvas.toBlob((blob) => {
        if (!blob) {
          URL.revokeObjectURL(url);
          throw new Error('Failed to create blob from canvas');
        }

        const resizedFile = new File([blob], file.name, { type: file.type });
        const dt = new DataTransfer();
        dt.items.add(resizedFile);

        cameraInput.files = dt.files;

        if (resizingCanvas) {
          displayImagePreview(resizingCanvas.toDataURL(file.type));
        }

        changeState('form');
      }, file.type);

      URL.revokeObjectURL(url);
    };
  });

  externalImageCaptureForm.addEventListener('submit', () => {
    changeState('uploading');
    listenForImageCaptureAcknowledgement();
  });

  tryAgainButton.addEventListener('click', () => {
    changeState('form');
  });
});
