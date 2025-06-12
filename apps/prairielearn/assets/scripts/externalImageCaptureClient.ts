import { io } from 'socket.io-client';

import { onDocumentReady } from '@prairielearn/browser-utils';

import type {
  StatusMessage,
  StatusMessageWithFileContent,
} from '../../src/lib/externalImageCaptureSocket.types.js';

const MAX_IMAGE_SIDE_LENGTH = 1000;

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
  const tryAgainButton = document.querySelector<HTMLButtonElement>(
    '#try-again-button',
  );

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

  function changeState(state: 'form' | 'loading' | 'success' | 'failed') {
    const externalImageCaptureLoadingContainer = document.querySelector<HTMLDivElement>(
      '#external-image-capture-loading-container',
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
    const tryAgainButtonSpan = document.querySelector<HTMLButtonElement>(
      '#try-again-button span',
    );
<<<<<<< HEAD
    const uploadButton = document.querySelector<HTMLButtonElement>('#upload-button');
=======
>>>>>>> 8e97e7584 ((WIP) implementing support for retake photo button on external image capture page)
    const uploadButtonSpan = document.querySelector<HTMLButtonElement>(
      '#upload-button span',
    );

    if (
      !externalImageCaptureLoadingContainer ||
      !externalImageCaptureFormContainer ||
      !formItems ||
      !externalImageCaptureSuccessContainer ||
      !externalImageCaptureFailedContainer ||
      !tryAgainButton || 
<<<<<<< HEAD
      !uploadButton || 
      !uploadButtonSpan
=======
      !tryAgainButtonSpan || 
      !uploadButtonSpan || 
      !uploadButton || 
      !cameraInputLabelSpan
>>>>>>> 8e97e7584 ((WIP) implementing support for retake photo button on external image capture page)
    ) {
      throw new Error('Required elements for changing state not found in the document');
    }

    if (state === 'form') {
      externalImageCaptureFormContainer.classList.remove('d-none');
      formItems.classList.remove('d-none');
    } else {
      if (!externalImageCaptureFormContainer.classList.contains('d-none')) {
        externalImageCaptureFormContainer.classList.add('d-none');
      }
    }

    if (state === 'loading') {
      externalImageCaptureLoadingContainer.classList.replace('d-none', 'd-flex');
    } else {
      externalImageCaptureLoadingContainer.classList.replace('d-flex', 'd-none');
    }

    if (state === 'success') {
      externalImageCaptureSuccessContainer.classList.remove('d-none');
      externalImageCaptureFormContainer.classList.remove('d-none');
      formItems.classList.add('d-none');

<<<<<<< HEAD
      if (!uploadButton.classList.contains('d-none')) {
        uploadButton.classList.add('d-none');
      }
      uploadButton.disabled = true;
      if (!imagePreview) {
        throw new Error('Image preview element not found in the document');
      }
      imagePreview.style.display = 'none';
      if (!imagePreview.src) {
        throw new Error('Image preview source is empty');
      }
      URL.revokeObjectURL(imagePreview.src);
      imagePreview.src = '';
      if (!cameraInputLabelSpan) {
        throw new Error('Camera input label span not found in the document');
      }
      cameraInputLabelSpan.textContent = 'Take photo';
      

      uploadButtonSpan.textContent = 'Upload';
=======
      tryAgainButtonSpan.textContent = 'Retake photo';
      tryAgainButton.classList.remove('d-none');

      // Reset the uploaded image 
      if (imagePreview) {
        imagePreview.src = '';
        imagePreview.style.display = 'none';
      }

      // Reset the upload button
      uploadButton.disabled = true;
      uploadButton.classList.add('d-none');
      uploadButtonSpan.textContent = 'Upload';
      
      // Reset the camera input label
      cameraInputLabelSpan.textContent = 'Take photo';

      // Click the camera input button to trigger the file input
      const cameraInputLabel = document.querySelector<HTMLInputElement>(
        '#camera-input'
      );
      console.log(cameraInputLabel);
      cameraInputLabel?.click();

      // ^ the above works. The only thing is you have to trigger 
      // the click when the user actually clicks retake photo.
>>>>>>> 8e97e7584 ((WIP) implementing support for retake photo button on external image capture page)
    } else {
      if (!externalImageCaptureSuccessContainer.classList.contains('d-none')) {
        externalImageCaptureSuccessContainer.classList.add('d-none');
      }
<<<<<<< HEAD
=======
      if (!tryAgainButton.classList.contains('d-none')) {
        tryAgainButton.classList.add('d-none');
      }
>>>>>>> 8e97e7584 ((WIP) implementing support for retake photo button on external image capture page)
    }

    if (state === 'failed') {
      externalImageCaptureFailedContainer.classList.remove('d-none');
      externalImageCaptureFormContainer.classList.remove('d-none');
      formItems.classList.add('d-none');

<<<<<<< HEAD
      tryAgainButton.classList.remove('d-none');

      console.log('uploadButtonSpan', uploadButtonSpan);
      uploadButtonSpan.textContent = 'Reupload';
      console.log('uploadButtonSpan', uploadButtonSpan);
=======
      tryAgainButtonSpan.textContent = 'Try again';
      tryAgainButton.classList.remove('d-none');

      uploadButtonSpan.textContent = 'Reupload';
>>>>>>> 8e97e7584 ((WIP) implementing support for retake photo button on external image capture page)
    } else {
      if (!externalImageCaptureFailedContainer.classList.contains('d-none')) {
        externalImageCaptureFailedContainer.classList.add('d-none');
      }
      if (state !== 'success') {
        formItems.classList.remove('d-none');
        if (!tryAgainButton.classList.contains('d-none')) {
          tryAgainButton.classList.add('d-none');
        }
      }
<<<<<<< HEAD
=======
      uploadButtonSpan.textContent = 'Upload';
>>>>>>> 8e97e7584 ((WIP) implementing support for retake photo button on external image capture page)
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
    const variant_id = externalImageCaptureForm.dataset.variantId;
    const file_name = externalImageCaptureForm.dataset.fileName;

    const socket = io('/external-image-capture');

    socket.emit(
      'joinExternalImageCapture',
      {
        variant_id,
        file_name,
      },
      (msg: StatusMessageWithFileContent) => {
        if (!msg) {
          changeState('failed');
          throw new Error('Failed to join external image capture room');
        }
      },
    );

    const timeoutMs = 10 * 1000; // 10 seconds

    const timeout = setTimeout(() => {
      changeState('failed');
      socket.disconnect();
    }, timeoutMs);

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
      if (!uploadButton.classList.contains('d-none')) {
        uploadButton.classList.add('d-none');
      }
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
      }, file.type);

      URL.revokeObjectURL(url);
    };
  });

  externalImageCaptureForm.addEventListener('submit', () => {
    changeState('loading');
    listenForImageCaptureAcknowledgement();
  });

  tryAgainButton.addEventListener('click', () => {
    changeState('form');
  });
});
