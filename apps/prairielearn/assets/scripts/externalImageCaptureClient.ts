import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(async () => {
  const permissionMessage = document.querySelector('#webcam-permission-message');
  if (!permissionMessage) {
    throw new Error('Webcam image preview canvas or permission message element not found');
  }

  try {
    // Stream the webcam video to the video element
    const webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });

    const webcamVideo = document.querySelector<HTMLVideoElement>('#webcam-video');
    if (!webcamVideo) {
      throw new Error('Webcam video element not found');
    }
    webcamVideo.srcObject = webcamStream;

    webcamVideo.setAttribute('autoplay', '');
    webcamVideo.setAttribute('muted', '');
    webcamVideo.setAttribute('playsinline', '')

    await webcamVideo.play();
    
    permissionMessage.classList.add('d-none');
    const captureImageButton = document.querySelector('.capture-image-button');
    if (!captureImageButton) {
      throw new Error('Capture image button not found');
    }

    // Allow the user to capture an image
    captureImageButton.removeAttribute('disabled');
  } catch {
    throw new Error('Could not start webcam.');
  }
});
