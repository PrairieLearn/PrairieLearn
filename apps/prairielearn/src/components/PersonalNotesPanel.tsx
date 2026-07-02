import { filesize } from 'filesize';

import { escapeHtml, html } from '@prairielearn/html';

import { config } from '../lib/config.js';
import type { AssessmentInstance, File } from '../lib/db-types.js';

/** Extensions whose contents can safely be opened and edited as plain text. */
const TEXT_NOTE_EXTENSIONS = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'log',
  'yml',
  'yaml',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'ts',
  'py',
  'c',
  'cpp',
  'h',
  'java',
  'r',
  'sql',
  'ini',
  'conf',
  'sh',
]);

/** A note is editable in-browser if it is a student-authored upload with a text-like extension. */
function isEditableTextNote(file: File): boolean {
  if (file.type !== 'student_upload') return false;
  const parts = file.display_filename.split('.');
  if (parts.length < 2) return false;
  return TEXT_NOTE_EXTENSIONS.has(parts[parts.length - 1].toLowerCase());
}

export function PersonalNotesPanel({
  fileList,
  courseInstanceId,
  assessment_instance,
  authz_result,
  variantId,
  allowNewUploads = true,
  lockdownBrowser = false,
  csrfToken,
  context,
}: {
  fileList: File[];
  courseInstanceId: string;
  assessment_instance: Pick<AssessmentInstance, 'id' | 'open'>;
  authz_result: Record<string, any>;
  variantId?: string;
  allowNewUploads?: boolean;
  /** Hides the file-picker form; its OS file dialog would let students open desktop files. */
  lockdownBrowser?: boolean;
  csrfToken: string;
  context: 'question' | 'assessment';
}) {
  const canEditNotes =
    allowNewUploads &&
    assessment_instance.open &&
    authz_result.active &&
    authz_result.authorized_edit;
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
              ${fileList.map((file) => {
                const fileUrl = `/pl/course_instance/${courseInstanceId}/assessment_instance/${assessment_instance.id}/file/${file.id}/${file.display_filename}`;
                return html`
                  <li class="list-group-item d-flex align-items-center">
                    ${canEditNotes && isEditableTextNote(file)
                      ? html`
                          <button
                            type="button"
                            class="btn btn-link p-0 text-break text-start me-2 edit-text-note"
                            data-file-id="${file.id}"
                            data-file-name="${file.display_filename}"
                            data-file-url="${fileUrl}"
                            data-testid="attached-file"
                          >
                            ${file.display_filename}
                          </button>
                        `
                      : html`
                          <a class="text-break me-2" href="${fileUrl}" data-testid="attached-file">
                            ${file.display_filename}
                          </a>
                        `}
                    ${assessment_instance.open &&
                    authz_result.active &&
                    authz_result.authorized_edit &&
                    allowNewUploads &&
                    file.type === 'student_upload'
                      ? html`
                          <div class="ms-auto">
                            ${DeletePersonalNoteButton({ file, variantId, csrfToken })}
                          </div>
                        `
                      : ''}
                  </li>
                `;
              })}
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
                      <div class="alert alert-warning mb-0" role="alert">
                        You are viewing the ${context} instance of a different user and so are not
                        authorized to add or delete personal notes.
                      </div>
                    `
                  : html`
                      ${lockdownBrowser ? '' : AttachFileForm({ variantId, csrfToken })}
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
        data-bs-toggle="collapse"
        data-bs-target="#attachFileCollapse"
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
          <div class="mb-3">
            <label class="form-label" for="attachFileInput">Choose file</label>
            <input type="file" name="file" class="form-control" id="attachFileInput" />
            <small class="form-text text-muted">
              Max file size: ${filesize(config.fileUploadMaxBytes, { base: 10, round: 0 })}
            </small>
          </div>
          <div class="mb-3">
            <input type="hidden" name="__action" value="attach_file" />
            ${variantId != null
              ? html`<input type="hidden" name="__variant_id" value="${variantId}" />`
              : ''}
            <input type="hidden" name="__csrf_token" value="${csrfToken}" />
            <button type="submit" class="btn btn-primary" disabled>Attach file</button>
          </div>
        </form>

        <script type="module">
          // This script is type="module" so that it is deferred and runs after the DOM is ready.
          const form = document.querySelector('form.attach-file-form');
          const fileInput = form.querySelector('#attachFileInput');
          const submitButton = form.querySelector('button[type="submit"]');
          fileInput.addEventListener('change', (e) => {
            // Only enable the "submit" button if a file is selected.
            submitButton.disabled = fileInput.files.length === 0;
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
        data-bs-toggle="collapse"
        data-bs-target="#attachTextCollapse"
        aria-expanded="false"
        aria-controls="attachTextCollapse"
      >
        <span id="attachTextToggleLabel">Add text note</span>
        <i class="far fa-caret-square-down"></i>
      </button>
      <div class="collapse" id="attachTextCollapse">
        <form method="POST" class="attach-text-form">
          <p class="small mt-3">
            Attached personal notes will be saved here for your reference. These notes can be used
            for your own review purposes. They are not used for grading. Click a saved text note
            above to open and edit it here.
          </p>
          <input
            type="text"
            class="form-control"
            aria-label="Text filename"
            name="filename"
            id="attachTextFilename"
            value="notes.txt"
          />
          <div class="mb-3">
            <textarea
              class="form-control"
              rows="5"
              aria-label="Text contents"
              name="contents"
              id="attachTextContents"
              placeholder="Type or paste text here"
            ></textarea>
          </div>
          ${variantId != null
            ? html`<input type="hidden" name="__variant_id" value="${variantId}" />`
            : ''}
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <input type="hidden" name="__action" id="attachTextAction" value="attach_text" />
          <input type="hidden" name="file_id" id="attachTextFileId" value="" />
          <button type="submit" class="btn btn-sm btn-primary" id="attachTextSubmit">
            Add note
          </button>
          <button type="button" class="btn btn-sm btn-link d-none" id="attachTextCancel">
            Cancel edit
          </button>
        </form>
      </div>
    </div>

    <script type="module">
      // This script is type="module" so that it is deferred and runs after the DOM is ready.
      const collapseEl = document.getElementById('attachTextCollapse');
      const toggleLabel = document.getElementById('attachTextToggleLabel');
      const filenameInput = document.getElementById('attachTextFilename');
      const contentsInput = document.getElementById('attachTextContents');
      const actionInput = document.getElementById('attachTextAction');
      const fileIdInput = document.getElementById('attachTextFileId');
      const submitButton = document.getElementById('attachTextSubmit');
      const cancelButton = document.getElementById('attachTextCancel');

      function setAddMode() {
        actionInput.value = 'attach_text';
        fileIdInput.value = '';
        filenameInput.value = 'notes.txt';
        contentsInput.value = '';
        toggleLabel.textContent = 'Add text note';
        submitButton.textContent = 'Add note';
        cancelButton.classList.add('d-none');
      }

      cancelButton.addEventListener('click', setAddMode);

      for (const button of document.querySelectorAll('.edit-text-note')) {
        button.addEventListener('click', async () => {
          const { fileId, fileName, fileUrl } = button.dataset;
          const response = await fetch(fileUrl);
          if (!response.ok) {
            window.location.href = fileUrl;
            return;
          }
          const contents = await response.text();

          actionInput.value = 'edit_text';
          fileIdInput.value = fileId;
          filenameInput.value = fileName;
          contentsInput.value = contents;
          toggleLabel.textContent = 'Edit text note';
          submitButton.textContent = 'Save note';
          cancelButton.classList.remove('d-none');

          window.bootstrap.Collapse.getOrCreateInstance(collapseEl).show();
          contentsInput.focus();
        });
      }
    </script>
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
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Delete</button>
      </div>
    </form>
  `;

  return html`
    <button
      class="btn btn-xs btn-secondary"
      aria-label="Delete personal note ${file.display_filename}"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-placement="auto"
      data-bs-title="Confirm delete"
      data-bs-content="${escapeHtml(popoverContent)}"
      data-testid="delete-personal-note-button"
    >
      <i class="far fa-trash-alt"></i>
    </button>
  `;
}
