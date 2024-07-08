import { filesize } from 'filesize';

import { escapeHtml, html, joinHtml, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';

export interface FileUploadInfo {
  id: string;
  info?: string;
  working_path: string;
  path?: string;
}

export interface FileDeleteInfo {
  id: string;
  name: string;
  path: string;
}

export interface FileRenameInfo {
  id: string;
  name: string;
  dir: string;
}

export function InstructorFileBrowser({ resLocals }: { resLocals: Record<string, any> }) {
  const {
    authz_data,
    course_owners,
    file_browser,
    navPage,
    course,
    __csrf_token: csrfToken,
  } = resLocals;
  const syncErrorsPartial =
    navPage === 'course_admin'
      ? 'courseSyncErrorsAndWarnings'
      : navPage === 'instance_admin'
        ? 'courseInstanceSyncErrorsAndWarnings'
        : navPage === 'assessment'
          ? 'assessmentSyncErrorsAndWarnings'
          : navPage === 'question'
            ? 'questionSyncErrorsAndWarnings'
            : '';

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Files',
        })}
        <link href="${nodeModulesAssetPath('highlight.js/styles/default.css')}" rel="stylesheet" />
        ${compiledScriptTag('instructorFileBrowserClient.ts')}
        <style>
          .popover {
            max-width: 50%;
          }
        </style>
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            `<%- include('../partials/${syncErrorsPartial}') %>`,
            resLocals,
          )}
          ${!authz_data.has_course_permission_view
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-danger text-white">Files</div>
                  <div class="card-body">
                    <h2>Insufficient permissions</h2>
                    <p>You must have at least &quot;Viewer&quot; permissions for this course.</p>
                    ${course_owners.length > 0
                      ? html`
                          <p>Contact one of the below course owners to request access.</p>
                          <ul>
                            ${course_owners.map(
                              (owner) => html`
                                <li>${owner.uid} ${owner.name ? `(${owner.name})` : ''}</li>
                              `,
                            )}
                          </ul>
                        `
                      : ''}
                  </div>
                </div>
              `
            : html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white">
                    <div class="row align-items-center justify-content-between">
                      <div class="col-auto text-monospace d-flex">
                        ${joinHtml(
                          file_browser.paths.branch.map(
                            (dir) => html`
                              ${dir.canView
                                ? html`
                                    <a
                                      class="text-white"
                                      href="${file_browser.paths
                                        .urlPrefix}/file_view/${dir.encodedPath}"
                                    >
                                      ${dir.name}
                                    </a>
                                  `
                                : html` <span>${dir.name}</span> `}
                            `,
                          ),
                          html`<span class="mx-2">/</span>`,
                        )}
                      </div>
                      <div class="col-auto">
                        ${file_browser.isFile
                          ? FileBrowserActions({ file_browser, csrfToken })
                          : authz_data.has_course_permission_edit && !course.example_course
                            ? DirectoryBrowserActions({ file_browser, csrfToken })
                            : ''}
                      </div>
                    </div>
                  </div>

                  ${file_browser.isFile
                    ? html`<div class="card-body">${FileContentPreview({ file_browser })}</div>`
                    : DirectoryBrowserBody({ file_browser, csrfToken })}
                </div>
              `}
        </main>
      </body>
    </html>
  `.toString();
}

function FileBrowserActions({
  file_browser,
  csrfToken,
}: {
  file_browser: Record<string, any>;
  csrfToken: string;
}) {
  return html`
    <a
      tabindex="0"
      class="btn btn-sm btn-light ${file_browser.file.canEdit ? '' : 'disabled'}"
      href="${file_browser.paths.urlPrefix}/file_edit/${file_browser.file.encodedPath}"
    >
      <i class="fa fa-edit"></i>
      <span>Edit</span>
    </a>
    <button
      type="button"
      id="instructorFileUploadForm-${file_browser.file.id}"
      class="btn btn-sm btn-light"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Upload file"
      data-content="${escapeHtml(FileUploadForm({ file: file_browser.file, csrfToken }))}"
      data-trigger="manual"
      onclick="$(this).popover('show')"
      ${file_browser.file.canUpload ? '' : 'disabled'}
    >
      <i class="fa fa-arrow-up"></i>
      <span>Upload</span>
    </button>
    <a
      class="btn btn-sm btn-light ${file_browser.file.canDownload ? '' : 'disabled'}"
      href="${file_browser.paths.urlPrefix}/file_download/${file_browser.file
        .encodedPath}?attachment=${file_browser.file.encodedName}"
    >
      <i class="fa fa-arrow-down"></i>
      <span>Download</span>
    </a>
    <button
      type="button"
      id="instructorFileRenameForm-${file_browser.file.id}"
      class="btn btn-sm btn-light"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Rename file"
      data-content="${escapeHtml(
        FileRenameForm({ file: file_browser.file, csrfToken, isViewingFile: true }),
      )}"
      data-trigger="manual"
      onclick="$(this).popover('show')"
      ${file_browser.file.canRename ? '' : 'disabled'}
    >
      <i class="fa fa-i-cursor"></i>
      <span>Rename</span>
    </button>
    <button
      type="button"
      id="instructorFileDeleteForm-${file_browser.file.id}"
      class="btn btn-sm btn-light"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Confirm delete"
      data-content="${escapeHtml(FileDeleteForm({ file: file_browser.file, csrfToken }))}"
      data-trigger="manual"
      onclick="$(this).popover('show')"
      ${file_browser.file.canDelete ? '' : 'disabled'}
    >
      <i class="far fa-trash-alt"></i>
      <span>Delete</span>
    </button>
  `;
}

function DirectoryBrowserActions({
  file_browser,
  csrfToken,
}: {
  file_browser: Record<string, any>;
  csrfToken: string;
}) {
  return html`
    ${file_browser.paths.specialDirs?.map(
      (d) => html`
        <button
          type="button"
          id="instructorFileUploadForm-New${d.label}"
          class="btn btn-sm btn-light"
          data-toggle="popover"
          data-container="body"
          data-html="true"
          data-placement="auto"
          title="Upload file"
          data-content="${escapeHtml(
            FileUploadForm({
              file: { id: `New${d.label}`, info: d.info, working_path: d.path },
              csrfToken,
            }),
          )}
          "
          data-trigger="manual"
          onclick="$(this).popover('show')"
        >
          <i class="fa fa-plus"></i>
          <span>Add new ${d.label.toLowerCase()} file</span>
        </button>
      `,
    )}
    <button
      type="button"
      id="instructorFileUploadForm-New"
      class="btn btn-sm btn-light"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Upload file"
      data-content="${escapeHtml(
        FileUploadForm({
          file: { id: 'New', working_path: file_browser.paths.workingPath },
          csrfToken,
        }),
      )}"
      data-trigger="manual"
      onclick="$(this).popover('show')"
    >
      <i class="fa fa-plus"></i>
      <span>Add new file</span>
    </button>
  `;
}

function FileContentPreview({ file_browser }: { file_browser: Record<string, any> }) {
  if (file_browser.isImage) {
    return html`
      <img
        src="${file_browser.paths.urlPrefix}/file_download/${file_browser.paths
          .workingPathRelativeToCourse}"
        class="img-fluid"
      />
    `;
  }
  if (file_browser.isText) {
    return html`<pre><code>${unsafeHtml(file_browser.contents)}</code></pre>`;
  }
  if (file_browser.isPDF) {
    return html`
      <div class="embed-responsive embed-responsive-4by3">
        <object
          data="${file_browser.paths.urlPrefix}/file_download/${file_browser.paths
            .workingPathRelativeToCourse}?type=application/pdf#view=FitH"
          type="application/pdf"
          class="embed-responsive-item"
        >
          This PDF cannot be displayed.
        </object>
      </div>
    `;
  }
  return html`<div class="alert alert-warning" role="alert">No preview available.</div>`;
}

function DirectoryBrowserBody({
  file_browser,
  csrfToken,
}: {
  file_browser: Record<string, any>;
  csrfToken: string;
}) {
  return html`
    <table class="table table-sm table-hover">
      <tbody>
        ${file_browser.files?.map(
          (f) => html`
            <tr>
              <td>
                ${f.sync_errors
                  ? html`
                      <button
                        type="button"
                        class="btn btn-xs mr-1"
                        data-toggle="popover"
                        data-title="Sync Errors"
                        data-html="true"
                        data-container="body"
                        data-trigger="hover"
                        data-content='<pre style="background-color: black" class="text-white rounded p-3">${f.sync_errors_ansified}</pre>'
                      >
                        <i class="fa fa-times text-danger" aria-hidden="true"></i>
                      </button>
                    `
                  : f.sync_warnings
                    ? html`
                        <button
                          type="button"
                          class="btn btn-xs mr-1"
                          data-toggle="popover"
                          data-title="Sync Warnings"
                          data-html="true"
                          data-container="body"
                          data-trigger="hover"
                          data-content='<pre style="background-color: black" class="text-white rounded p-3">${f.sync_warnings_ansified}</pre>'
                        >
                          <i class="fa fa-exclamation-triangle text-warning" aria-hidden="true"></i>
                        </button>
                      `
                    : ''}
                <span><i class="far fa-file-alt fa-fw"></i></span>
                ${f.canView
                  ? html`
                      <a href="${file_browser.paths.urlPrefix}/file_view/${f.encodedPath}">
                        ${f.name}
                      </a>
                    `
                  : html`<span>${f.name}</span>`}
              </td>
              <td>
                <a
                  class="btn btn-xs btn-secondary ${f.canEdit ? '' : 'disabled'}"
                  href="${file_browser.paths.urlPrefix}/file_edit/${f.encodedPath}"
                >
                  <i class="fa fa-edit"></i>
                  <span>Edit</span>
                </a>
                <button
                  type="button"
                  id="instructorFileUploadForm-${f.id}"
                  class="btn btn-xs btn-secondary"
                  data-toggle="popover"
                  data-container="body"
                  data-html="true"
                  data-placement="auto"
                  title="Upload file"
                  data-content="
                  ${escapeHtml(FileUploadForm({ file: f, csrfToken }))}"
                  data-trigger="manual"
                  onclick="$(this).popover('show')"
                  ${f.canUpload ? '' : 'disabled'}
                >
                  <i class="fa fa-arrow-up"></i>
                  <span>Upload</span>
                </button>
                <a
                  class="btn btn-xs btn-secondary ${f.canDownload ? '' : 'disabled'}"
                  href="${file_browser.paths
                    .urlPrefix}/file_download/${f.encodedPath}?attachment=${f.encodedName}"
                >
                  <i class="fa fa-arrow-down"></i>
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  id="instructorFileRenameForm-${f.id}"
                  class="btn btn-xs btn-secondary"
                  data-toggle="popover"
                  data-container="body"
                  data-html="true"
                  data-placement="auto"
                  title="Rename file"
                  data-content="${escapeHtml(
                    FileRenameForm({ file: f, csrfToken, isViewingFile: false }),
                  )}"
                  data-trigger="manual"
                  onclick="$(this).popover('show')"
                  ${f.canRename ? '' : 'disabled'}
                >
                  <i class="fa fa-i-cursor"></i>
                  <span>Rename</span>
                </button>
                <button
                  type="button"
                  id="instructorFileDeleteForm-${f.id}"
                  class="btn btn-xs btn-secondary"
                  data-toggle="popover"
                  data-container="body"
                  data-html="true"
                  data-placement="auto"
                  title="Confirm delete"
                  data-content="${escapeHtml(FileDeleteForm({ file: f, csrfToken }))}"
                  data-trigger="manual"
                  onclick="$(this).popover('show')"
                  ${f.canDelete ? '' : 'disabled'}
                >
                  <i class="far fa-trash-alt"></i>
                  <span>Delete</span>
                </button>
              </td>
            </tr>
          `,
        )}
        ${file_browser.dirs.map(
          (d) => html`
            <tr>
              <td colspan="2">
                <i class="fa fa-folder fa-fw"></i>
                ${d.canView
                  ? html`
                      <a href="${file_browser.paths.urlPrefix}/file_view/${d.encodedPath}">
                        ${d.name}
                      </a>
                    `
                  : html`<span>${d.name}</span>`}
              </td>
            </tr>
          `,
        )}
      </tbody>
    </table>
  `;
}

function FileUploadForm({ file, csrfToken }: { file: FileUploadInfo; csrfToken: string }) {
  return html`
    <form
      class="needs-validation"
      name="instructor-file-upload-form-${file.id}"
      method="POST"
      enctype="multipart/form-data"
      novalidate
    >
      ${file.info ? html`<div class="form-group">${unsafeHtml(file.info)}</div>` : ''}

      <div class="form-group">
        <div class="custom-file">
          <input
            type="file"
            name="file"
            class="custom-file-input"
            id="attachFileInput-${file.id}"
            required
          />
          <label class="custom-file-label" for="attachFileInput-${file.id}">Choose file</label>
          <small class="form-text text-muted">
            Max file size: ${filesize(config.fileUploadMaxBytes, { base: 10, round: 0 })}
          </small>
        </div>
      </div>

      <div class="form-group">
        <input type="hidden" name="__action" value="upload_file" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        ${file.path
          ? html`<input type="hidden" name="file_path" value="${file.path}" />`
          : html`<input type="hidden" name="working_path" value="${file.working_path}" />`}
        <div class="text-right">
          <button
            type="button"
            class="btn btn-secondary"
            onclick="$('#instructorFileUploadForm-${file.id}').popover('hide')"
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">Upload file</button>
        </div>
      </div>
    </form>
  `;
}

function FileDeleteForm({ file, csrfToken }: { file: FileDeleteInfo; csrfToken: string }) {
  return html`
    <form name="instructor-file-delete-form-${file.id}" method="POST">
      <p>Are you sure you want to delete <strong>${file.name}</strong>?</p>
      <input type="hidden" name="__action" value="delete_file" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="file_path" value="${file.path}" />
      <div class="text-right">
        <button
          type="button"
          class="btn btn-secondary"
          onclick="$('#instructorFileDeleteForm-${file.id}').popover('hide')"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Delete</button>
      </div>
    </form>
  `;
}

function FileRenameForm({
  file,
  csrfToken,
  isViewingFile,
}: {
  file: FileRenameInfo;
  csrfToken: string;
  isViewingFile: boolean;
}) {
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
      ${isViewingFile ? html` <input type="hidden" name="was_viewing_file" value="true" /> ` : ''}
      <input type="hidden" name="old_file_name" value="${file.name}" />
      <div class="container p-0 mb-4">
        Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is
        recommended, delimited by a period. If you want to move the file to a different directory,
        you can specify a relative path that is delimited by a forward slash and that includes
        "<code>..</code>".
      </div>
      <div class="form-group">
        <label for="renameFileInput">Path:</label>
        <input
          type="text"
          class="form-control js-rename-input"
          id="renameFileInput"
          name="new_file_name"
          value="${file.name}"
          data-original-value="${file.name}"
          size="${1.5 * file.name.length}"
          pattern="(?:[\\-A-Za-z0-9_]+|\\.\\.)(?:\\/(?:[\\-A-Za-z0-9_]+|\\.\\.))*(?:\\.[\\-A-Za-z0-9_]+)?"
          required
        />
      </div>
      <div class="text-right">
        <button
          type="button"
          class="btn btn-secondary"
          onclick="$('#instructorFileRenameForm-${file.id}').popover('hide')"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
