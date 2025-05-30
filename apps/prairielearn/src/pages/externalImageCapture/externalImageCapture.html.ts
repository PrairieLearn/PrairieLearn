import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

export function ExternalImageCapture({ resLocals }: { resLocals: Record<string, any> }) {
  return PageLayout({
    resLocals,
    pageTitle: 'External image capture',
    navContext: {
      type: 'student',
      page: 'assessment_instance',
    },
    preContent: html` ${compiledScriptTag('externalImageCaptureClient.ts')} `,
    content: html`
      <h1>Capture solution</h1>
      <form method="POST" enctype="multipart/form-data">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input
          type="hidden"
          id="camera-input"
          name="file"
          accept="image/png"
          capture="environment"
          required
        />
        <div class="position-relative">
          <video
            id="webcam-video"
            class="w-100 bg-body-secondary rounded border"
            autoplay
            playsinline
          ></video>

          <div
            id="webcam-permission-message"
            class="position-absolute top-50 start-50 translate-middle text-center text-muted px-2"
            style="pointer-events: none;"
          >
            Give permission to access your camera to capture an image.
          </div>
        </div>
        <p class="text-muted mt-0"> 
        Ensure that your entire solution is visible, legible, and well-lit in the image.
        </p>
        <div class="d-flex gap-1 mt-1">
          <button id="capture-image-button" class="btn btn-info" disabled>
            <i class="bi bi-camera-fill me-1"></i>
            Capture image
          </button>
        </div>
      </form>
    `,
  });
}



export function ExternalImageCaptureSuccess({ resLocals }: { resLocals: Record<string, any> }) {
  return PageLayout({
    resLocals,
    pageTitle: 'External image capture',
    navContext: {
      type: 'student',
      page: 'assessment_instance',
    },
    content: html`
      <h1 class="d-flex align-items-center gap-2">
        <i class="bi bi-check-circle-fill text-success me-2"></i>
        Upload successful
      </h1>
      <p>You should now see your captured image on the assessment page.</p>
    `,
  });
}
