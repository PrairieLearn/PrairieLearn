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
    preContent: html` ${compiledScriptTag('externalImageCaptureClient.ts')} `,
    content: html`
      <form
        id="external-image-capture-form"
        hx-post
        hx-trigger="submit"
        hx-swap="none"
        enctype="multipart/form-data"
        data-variant-id="${variantId}"
        data-file-name="${fileName}"
      >
        <div id="external-image-capture-loading-container" class="d-none align-items-center gap-2">
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
        <div id="external-image-capture-form-container">
          <div id="form-items">
            <h1>Capture solution</h1>

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
            <div>
              <label
                for="camera-input"
                class="d-flex flex-column align-items-center justify-content-center
                              border border-primary rounded p-4 text-center"
                style="cursor: pointer; border-style: dashed !important;"
              >
                <div id="preview-container" class="mt-4 text-center">
                  <img
                    id="image-preview"
                    class="img-fluid rounded border border-secondary mb-3"
                    style="max-height: 300px; display: none;"
                    alt="Image capture preview"
                  />
                </div>

                <i class="bi bi-camera text-primary fs-1"></i>
                <span class="text-primary">Take photo</span>
              </label>

              <p class="text-muted mt-3">
                Before uploading, make sure your photo is clear, well-lit, and shows all your work legibly.
                in the image.
              </p>
            </div>
          </div>
          <button type="submit" class="btn btn-primary my-3" id="upload-button" disabled>
            Upload
          </button>
        </div>
      </form>
    `,
  });
}
