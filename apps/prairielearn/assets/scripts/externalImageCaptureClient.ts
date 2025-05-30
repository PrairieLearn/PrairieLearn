import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const cameraInput = document.getElementById('camera-input') as HTMLInputElement;
  const camerInputLabelSpan = document
    .querySelector('label[for="camera-input"]')
    ?.querySelector('span') as HTMLLabelElement;
  const submitButton = document.getElementById('submit-button') as HTMLButtonElement;
  const imagePreview = document.getElementById('image-preview') as HTMLImageElement;

  cameraInput.addEventListener('change', () => {
    if (cameraInput.files && cameraInput.files.length > 0) {
      // Select the image the user uploaded.
      const file = cameraInput.files[0];

      // Display it in the image preview element.
      imagePreview.src = URL.createObjectURL(file);
      imagePreview.style.display = 'block';
      imagePreview.onload = () => URL.revokeObjectURL(imagePreview.src);

      submitButton.disabled = false;
      camerInputLabelSpan.textContent = 'Retake photo';
    } else {
      // The user cannot submit if no file was uploaded.
      submitButton.disabled = true;
    }
  });
});
