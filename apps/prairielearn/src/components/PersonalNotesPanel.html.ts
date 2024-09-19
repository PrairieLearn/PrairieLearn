import { filesize } from 'filesize';

import { escapeHtml, html } from '@prairielearn/html';

import { config } from '../lib/config.js';
import type { AssessmentInstance, File } from '../lib/db-types.js';

export function PersonalNotesPanel({
  fileList,
  courseInstanceId,
  assessment_instance,
  authz_result,
  variantId,
  allowNewUploads = true,
  csrfToken,
  context,
}: {
  fileList: File[];
  courseInstanceId: string;
  assessment_instance: Pick<AssessmentInstance, 'id' | 'open'>;
  authz_result: Record<string, any>;
  variantId?: string;
  allowNewUploads?: boolean;
  csrfToken: string;
  context: 'question' | 'assessment';
}) {
  return html`
    <div class="card mb-4" id="attach-file-panel">
      <div class="card-header bg-secondary text-white d-flex align-items-center">
        <i class="fas fa-paperclip"></i>
        <h2>&nbsp;Personal Notes</h2>
      </div>
      ${fileList.length === 0
        ? html`<div class="card-body"><i>No attached notes</i></div>`
        : html`
            <ul class="list-group list-group-flush">
              ${fileList.map(
                (file) => html`
                  <li class="list-group-item d-flex align-items-center">
                    <a
                      class="text-break mr-2"
                      href="${config.urlPrefix}/course_instance/${courseInstanceId}/assessment_instance/${assessment_instance.id}/file/${file.id}/${file.display_filename}"
                      data-testid="attached-file"
                    >
                      ${file.display_filename}
                    </a>
                    ${assessment_instance.open &&
                    authz_result.active &&
                    authz_result.authorized_edit &&
                    allowNewUploads &&
                    file.type === 'student_upload'
                      ? html`
                          <div class="ml-auto">
                            ${DeletePersonalNoteButton({ file, variantId, csrfToken })}
                          </div>
                        `
                      : ''}
                  </li>
                `,
              )}
            </ul>
          `}
      ${allowNewUploads
        ? html`
            <div class="card-footer">
              ${!assessment_instance.open || !authz_result.active
                ? html`
                    <p class="small mb-0">
                      Notes can't be added or deleted because the assessment is closed.
                    </p>
                  `
                : !authz_result.authorized_edit
                  ? html`
                      <div class="alert alert-warning mt-2" role="alert">
                        You are viewing the ${context} instance of a different user and so are not
                        authorized to add or delete personal notes.
                      </div>
                    `
                  : html`
                      ${AttachFileForm({ variantId, csrfToken })}
                      ${UploadTextForm({ variantId, csrfToken })}
                    `}
            </div>
          `
        : ''}
    </div>
  `;
}

function AttachFileForm({ variantId, csrfToken }: { variantId?: string; csrfToken: string }) {
  return html`
    <div>
      <button
        class="btn btn-xs btn-secondary"
        type="button"
        data-toggle="collapse"
        data-target="#attachFileCollapse"
        aria-expanded="false"
        aria-controls="attachFileCollapse"
      >
        Attach a file <i class="far fa-caret-square-down"></i>
      </button>
      <div class="collapse" id="attachFileCollapse">
        <form
          class="attach-file-form mb-3"
          name="attach-file-form"
          method="POST"
          enctype="multipart/form-data"
        >
          <p class="small mt-3">
            Attached files will be saved here for your reference. These files act as personal notes
            and can be used for your own review purposes. They are not used for grading.
          </p>
          <div class="form-group">
            <div class="custom-file">
              <input type="file" name="file" class="custom-file-input" id="attachFileInput" />
              <label class="custom-file-label" for="attachFileInput">Choose file</label>
              <small class="form-text text-muted">
                Max file size: ${filesize(config.fileUploadMaxBytes, { base: 10, round: 0 })}
              </small>
            </div>
          </div>
          <div class="form-group mb-0">
            <input type="hidden" name="__action" value="attach_file" />
            ${variantId != null
              ? html`<input type="hidden" name="__variant_id" value="${variantId}" />`
              : ''}
            <input type="hidden" name="__csrf_token" value="${csrfToken}" />
            <button type="submit" class="btn btn-primary" disabled>Attach file</button>
          </div>
        </form>

        <script>
          $(() => {
            // Only enable the "submit" button if a file is selected.
            const form = document.querySelector('form.attach-file-form');
            const fileInput = form.querySelector('#attachFileInput');
            const submitButton = form.querySelector('button[type="submit"]');
            fileInput.addEventListener('change', (e) => {
              submitButton.disabled = fileInput.files.length === 0;
            });
          });
        </script>
      </div>
    </div>
  `;
}

function UploadTextForm({ variantId, csrfToken }: { variantId?: string; csrfToken: string }) {
  return html`
    <div>
      <button
        class="btn btn-xs btn-secondary"
        type="button"
        data-toggle="collapse"
        data-target="#attachTextCollapse"
        aria-expanded="false"
        aria-controls="attachTextCollapse"
      >
        Add text note <i class="far fa-caret-square-down"></i>
      </button>
      <div class="collapse" id="attachTextCollapse">
        <form method="POST" class="attach-text-form">
          <p class="small mt-3">
            Attached personal notes will be saved here for your reference. These notes can be used
            for your own review purposes. They are not used for grading.
          </p>
          <input
            class="form-control"
            aria-label="Text filename"
            name="filename"
            value="notes.txt"
          />
          <div class="form-group">
            <textarea
              class="form-control"
              rows="5"
              aria-label="Text contents"
              name="contents"
              placeholder="Type or paste text here"
            ></textarea>
          </div>
          ${variantId != null
            ? html`<input type="hidden" name="__variant_id" value="${variantId}" />`
            : ''}
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <button class="btn btn-small btn-primary" name="__action" value="attach_text">
            Add note
          </button>
        </form>
      </div>
    </div>
  `;
}

function DeletePersonalNoteButton({
  file,
  variantId,
  csrfToken,
}: {
  file: File;
  variantId?: string;
  csrfToken: string;
}) {
  const popoverContent = html`
    <form name="attach-file-delete-form" method="POST">
      <p>Are you sure you want to delete <strong>${file.display_filename}</strong>?</p>
      <input type="hidden" name="__action" value="delete_file" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      ${variantId != null
        ? html`<input type="hidden" name="__variant_id" value="${variantId}" />`
        : ''}
      <input type="hidden" name="file_id" value="${file.id}" />
      <div class="text-right">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Delete</button>
      </div>
    </form>
  `;

  return html`
    <button
      class="btn btn-xs btn-secondary"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Confirm delete"
      aria-label="Delete personal note ${file.display_filename}"
      data-content="${escapeHtml(popoverContent)}"
      data-testid="delete-personal-note-button"
    >
      <i class="far fa-trash-alt"></i>
    </button>
  `;
}
