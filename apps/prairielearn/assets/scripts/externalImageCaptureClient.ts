import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
    const cameraInput = document.getElementById('camera-input') as HTMLInputElement;
    const takePhotoSpan = document.querySelector('label[for="camera-input"]')?.querySelector('span') as HTMLLabelElement;
    const submitButton = document.getElementById('submit-button') as HTMLButtonElement;
    const previewImage = document.getElementById('preview-image') as HTMLImageElement;

    cameraInput.addEventListener('change', () => {
        if (cameraInput.files && cameraInput.files.length > 0) {
            const file = cameraInput.files[0];

            // Create a blob URL for quick preview
            previewImage.src = URL.createObjectURL(file);
            previewImage.style.display = 'block';

            // Revoke the blob URL after image loads to free memory
            previewImage.onload = () => URL.revokeObjectURL(previewImage.src);

            submitButton.disabled = false;
            takePhotoSpan.textContent = 'Retake photo';
        } else {
            submitButton.disabled = true;
        }
    });
})