import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const cameraInput = document.querySelector<HTMLInputElement>('#camera-input');
  const rawCameraInput = document.querySelector<HTMLInputElement>('#raw-camera-input');

  const rawCameraInputLabelSpan = document.querySelector<HTMLLabelElement>(
    'label[for="raw-camera-input"] span',
  );
  const uploadButton = document.querySelector<HTMLButtonElement>('#upload-button');
  const imagePreview = document.querySelector<HTMLImageElement>('#image-preview');
  const externalImageCaptureForm = document.querySelector<HTMLFormElement>(
    '#external-image-capture-form',
  );

  if (
    !cameraInput ||
    !rawCameraInput ||
    !rawCameraInputLabelSpan ||
    !uploadButton ||
    !imagePreview ||
    !externalImageCaptureForm
  ) {
    throw new Error('Required elements not found in the document');
  }

  rawCameraInput.addEventListener('change', () => {
    rawCameraInput.disabled = false;
    if (rawCameraInput.files && rawCameraInput.files.length > 0) {
      // Select the image the user uploaded.
      const file = rawCameraInput.files[0];
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.src = url;

      image.onload = () => {
        // Perform scaling to ensure that user-uploaded images are not too large.
        // The scale factor ensures that the width and height of the image do not exceed 1000px.
        // If the image width and height are both less than 1000px, no scaling is applied.
        const imageScaleFactor = Math.min(1000 / Math.max(image.width, image.height), 1);

        const targetWidth = Math.round(image.width * imageScaleFactor);
        const targetHeight = Math.round(image.height * imageScaleFactor);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

        imagePreview.src = canvas.toDataURL(file.type);
        imagePreview.style.display = 'block';

        canvas.toBlob((blob) => {
          if (!blob) {
            URL.revokeObjectURL(url);
            throw new Error('Failed to create blob from canvas');
          }
          const resizedFile = new File([blob], file.name, { type: file.type });
          const dt = new DataTransfer();
          dt.items.add(resizedFile);

          cameraInput.files = dt.files;
          uploadButton.disabled = false;
          rawCameraInputLabelSpan.textContent = 'Retake photo';

          URL.revokeObjectURL(url);

          uploadButton.disabled = false;
        }, file.type);
      };
    } else {
      // The user cannot submit if no file was uploaded.
      uploadButton.disabled = true;
    }
  });
  externalImageCaptureForm.addEventListener('htmx:beforeRequest', () => {
    rawCameraInput.disabled = true;
  });
});
