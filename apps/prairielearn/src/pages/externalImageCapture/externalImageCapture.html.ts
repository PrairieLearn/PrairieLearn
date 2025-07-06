import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

export function ExternalImageCapture({
  variantId,
  fileName,
  resLocals,
}: {
  variantId: string;
  fileName: string;
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'External image capture',
    navContext: {
      type: 'student',
      page: 'assessment_instance',
    },
    headContent: compiledScriptTag('externalImageCaptureClient.ts'),
    content: html`
      <form
        id="external-image-capture-form"
        hx-post
        hx-trigger="submit"
        hx-swap="none"
        enctype="multipart/form-data"
        data-variant-id="${variantId}"
        data-variant-token="${resLocals.variantToken}"
        data-file-name="${fileName}"
      >
        <div id="external-image-capture-loading-container" class="d-flex align-items-center gap-2">
          <div class="spinning-wheel spinner-border">
            <span class="visually-hidden">Loading...</span>
          </div>
          <h1 class="d-flex align-items-center my-0">Loading...</h1>
        </div>
        <div
          id="external-image-capture-uploading-container"
          class="d-none align-items-center gap-2"
        >
          <div class="spinning-wheel spinner-border">
            <span class="visually-hidden">Uploading...</span>
          </div>
          <h1 class="d-flex align-items-center my-0">Uploading...</h1>
        </div>
        <div id="external-image-capture-success-container" class="d-none">
          <h1 class="d-flex align-items-center gap-2">
            <i class="bi bi-check-circle-fill text-success me-2"></i>
            Upload successful
          </h1>
          <p>You should now see your captured image on the assessment page.</p>
        </div>
        <div id="external-image-capture-failed-container" class="d-none">
          <h1 class="d-flex align-items-center gap-2">
            <i class="bi bi-x-circle-fill text-danger me-2"></i>
            Upload failed
          </h1>
          <p>An error occured during the submission of your file.</p>
        </div>
        <div id="external-image-capture-form-container" class="d-none pb-4">
          <div id="form-items">
            <h1>Capture image</h1>

            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="file_name" value="${fileName}" />
            <input
              type="file"
              id="camera-input"
              name="file"
              accept="image/*"
              capture="environment"
              class="visually-hidden"
              required
            />
            <img
              id="image-preview"
              class="img-fluid rounded border border-secondary mb-3 w-100"
              style="display: none;"
              alt="Image capture preview"
            />
            <p class="text-muted mt-3">
              Before uploading, make sure your photo is clear, well-lit, and shows all your work
              legibly.
            </p>
          </div>
          <button type="submit" class="btn btn-primary d-none" id="upload-button" disabled>
            <i class="bi bi-check2 me-1"></i>
            <span>Upload</span>
          </button>
          <label for="camera-input" style="cursor: pointer;">
            <button type="button" class="btn btn-primary pe-none">
              <i class="bi bi-camera-fill me-1"></i>
              <span>Take photo</span>
            </button>
          </label>
          <button type="button" class="btn btn-primary d-none" id="try-again-button">
            <i class="bi bi-arrow-counterclockwise me-1"></i>
            <span>Try again</span>
          </button>
        </div>
      </form>
    `,
  });
}
