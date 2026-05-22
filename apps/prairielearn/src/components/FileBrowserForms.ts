import { filesize } from 'filesize';

import { type HtmlValue, html } from '@prairielearn/html';

type FileUploadInfo = {
  id: string | number;
  info?: HtmlValue;
} & (
  | {
      path: string;
      working_path?: unknown;
    }
  | {
      path?: null | undefined;
      working_path: string;
    }
);

interface FileDeleteInfo {
  id: string | number;
  name: string;
  path: string;
}

interface FileRenameInfo {
  id: string | number;
  name: string;
  dir: string;
}

export function FileUploadForm({
  file,
  csrfToken,
  maxFileSizeBytes,
}: {
  file: FileUploadInfo;
  csrfToken: string;
  maxFileSizeBytes: number;
}) {
  return html`
    <form
      class="needs-validation"
      name="instructor-file-upload-form-${file.id}"
      method="POST"
      enctype="multipart/form-data"
      novalidate
    >
      ${file.info ? html`<div class="mb-3">${file.info}</div>` : ''}

      <div class="mb-3">
        <label class="form-label" for="attachFileInput-${file.id}">Choose file</label>
        <input
          type="file"
          name="file"
          class="form-control"
          id="attachFileInput-${file.id}"
          required
        />
        <small class="form-text text-muted">
          Max file size: ${filesize(maxFileSizeBytes, { base: 10, round: 0 })}
        </small>
      </div>

      <div class="mb-3">
        <input type="hidden" name="__action" value="upload_file" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        ${file.path != null
          ? html`<input type="hidden" name="file_path" value="${file.path}" />`
          : html`<input type="hidden" name="working_path" value="${file.working_path}" />`}
        <div class="text-end justify-content-end gap-2 d-flex flex-wrap">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
          <button type="submit" class="btn btn-primary">Upload file</button>
        </div>
      </div>
    </form>
  `;
}

export function FileDeleteForm({ file, csrfToken }: { file: FileDeleteInfo; csrfToken: string }) {
  return html`
    <form name="instructor-file-delete-form-${file.id}" method="POST">
      <p>Are you sure you want to delete <strong>${file.name}</strong>?</p>
      <input type="hidden" name="__action" value="delete_file" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="file_path" value="${file.path}" />
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Delete</button>
      </div>
    </form>
  `;
}

export function FileRenameForm({
  file,
  csrfToken,
  isViewingFile,
}: {
  file: FileRenameInfo;
  csrfToken: string;
  isViewingFile: boolean;
}) {
  const FILE_NAME_PATTERN =
    /(?:[A-Za-z0-9_-]+|\.\.)(?:\/(?:[A-Za-z0-9_-]+|\.\.))*(?:\.[A-Za-z0-9_-]+)?/;
  return html`
    <form
      name="instructor-file-rename-form-${file.id}"
      method="POST"
      class="needs-validation"
      novalidate
    >
      <input type="hidden" name="__action" value="rename_file" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="working_path" value="${file.dir}" />
      ${isViewingFile ? html`<input type="hidden" name="was_viewing_file" value="true" />` : ''}
      <input type="hidden" name="old_file_name" value="${file.name}" />
      <div class="container p-0 mb-4">
        Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is
        recommended, delimited by a period. If you want to move the file to a different directory,
        you can specify a relative path that is delimited by a forward slash and that includes
        "<code>..</code>".
      </div>
      <div class="mb-3">
        <label class="form-label" for="renameFileInput${file.id}">Path:</label>
        <input
          type="text"
          class="form-control js-rename-input"
          id="renameFileInput${file.id}"
          name="new_file_name"
          value="${file.name}"
          data-original-value="${file.name}"
          size="${1.5 * file.name.length}"
          pattern="${FILE_NAME_PATTERN.source}"
          required
        />
      </div>
      <div class="text-end justify-content-end gap-2 d-flex flex-wrap">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
