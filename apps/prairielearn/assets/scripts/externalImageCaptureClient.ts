import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const cameraInput = document.getElementById('camera-input') as HTMLInputElement;
  const rawCameraInput = document.getElementById('raw-camera-input') as HTMLInputElement;

  const cameraInputLabelSpan = document
    .querySelector('label[for="raw-camera-input"]')
    ?.querySelector('span') as HTMLLabelElement;
  const uploadButton = document.getElementById('upload-button') as HTMLButtonElement;
  const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
  const captureSolutionForm = document.getElementById('capture-solution-form') as HTMLFormElement;

  rawCameraInput.addEventListener('change', () => {
    console.log('Data uploaded.')
    rawCameraInput.disabled = false;
    if (rawCameraInput.files && rawCameraInput.files.length > 0) {
      // Select the image the user uploaded.
      const file = rawCameraInput.files[0];
      const url  = URL.createObjectURL(file);
      const image = new Image();

      image.src = url;

      image.onload = () => {
        const imageScaleFactor = Math.min(
          1000 / Math.max(image.width, image.height), // Width and height should be at most 1000px
          1 // Scale factor should not exceed 1 (no scaling up)
        );
        console.log('imageScaleFactor', imageScaleFactor);
      
        const targetWidth = Math.round(image.width * imageScaleFactor);
        const targetHeight = Math.round(image.height * imageScaleFactor);

        const canvas = document.createElement('canvas');
        canvas.width  = targetWidth;
        canvas.height = targetHeight;  

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Failed to get canvas context');
          return;
        }

        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

        imagePreview.src = canvas.toDataURL(file.type);
        imagePreview.style.display = 'block';

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              URL.revokeObjectURL(url);
              return;
            }
            const resizedFile = new File([blob], file.name, { type: file.type });
            const dt = new DataTransfer();
            dt.items.add(resizedFile);

            cameraInput.files = dt.files;
            uploadButton.disabled = false;
            cameraInputLabelSpan.textContent = 'Retake photo';

            console.log('rawCameraInput size', file.size);
            console.log('cameraInput size', cameraInput.files[0].size);
            URL.revokeObjectURL(url);
            uploadButton.disabled = false;
          },
          file.type
        );
      };
    } else {
      // The user cannot submit if no file was uploaded.
      uploadButton.disabled = true;
    }
  });
  captureSolutionForm.addEventListener('submit', () => {
     rawCameraInput.disabled = true;
  });

});
