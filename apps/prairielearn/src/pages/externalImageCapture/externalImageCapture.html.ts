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
      <h1>Scan submission</h1>
      <form method="POST" enctype="multipart/form-data">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input
          type="file"
          id="camera-input"
          name="file"
          accept="image/png"
          capture="environment"
          required
          class="visually-hidden"
        />
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
              alt="Photo preview"
            />
          </div>

          <i class="bi bi-camera text-primary fs-1"></i>
          <span class="text-primary">Take photo</span>
        </label>

        <p class="text-muted mt-3">
          Before submitting, ensure that the entire submission is visible, legible, and well-lit in
          the photo.
        </p>

        <button type="submit" class="btn btn-primary my-3" id="submit-button" disabled>
          Submit
        </button>
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
        Scan successful
      </h1>
      <p>
        Click "Refresh" under the submitted file list in the assessment to update your submission.
      </p>
    `,
  });
}
