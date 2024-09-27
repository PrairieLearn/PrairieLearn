import { filesize } from 'filesize';

import { escapeHtml, html, type HtmlValue, joinHtml, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import {
  AssessmentSyncErrorsAndWarnings,
  CourseInstanceSyncErrorsAndWarnings,
  CourseSyncErrorsAndWarnings,
  QuestionSyncErrorsAndWarnings,
} from '../../components/SyncErrorsAndWarnings.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import type { InstructorFilePaths } from '../../lib/instructorFiles.js';
import { encodePath } from '../../lib/uri-util.js';

export interface FileInfo {
  id: number;
  name: string;
  path: string;
  dir: string;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canRename: boolean;
  canDelete: boolean;
  canView: boolean;
  isBinary: boolean;
  isImage: boolean;
  isPDF: boolean;
  isText: boolean;
  contents?: string | null;
}

export interface DirectoryEntry {
  id: string | number;
  name: string;
  path: string;
  canView: boolean;
}

export interface DirectoryEntryDirectory extends DirectoryEntry {
  isFile: false;
}

export interface DirectoryEntryFile extends DirectoryEntry {
  isFile: true;
  dir: string;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canRename: boolean;
  canDelete: boolean;
  sync_errors: string | null;
  sync_warnings: string | null;
}

export interface DirectoryListings {
  dirs: DirectoryEntryDirectory[];
  files: DirectoryEntryFile[];
}

export type FileUploadInfo = {
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

export interface FileDeleteInfo {
  id: string | number;
  name: string;
  path: string;
}

export interface FileRenameInfo {
  id: string | number;
  name: string;
  dir: string;
}

export function InstructorFileBrowser({
  resLocals,
  paths,
  isFile,
  fileInfo,
  directoryListings,
}: { resLocals: Record<string, any>; paths: InstructorFilePaths } & (
  | { isFile: true; fileInfo: FileInfo; directoryListings?: undefined }
  | { isFile: false; directoryListings: DirectoryListings; fileInfo?: undefined }
)) {
  const { navPage, __csrf_token: csrfToken, authz_data, course, urlPrefix } = resLocals;
  const syncErrorsAndWarnings =
    navPage === 'course_admin'
      ? CourseSyncErrorsAndWarnings({ authz_data, course, urlPrefix })
      : navPage === 'instance_admin'
        ? CourseInstanceSyncErrorsAndWarnings({
            authz_data,
            courseInstance: resLocals.course_instance,
            course,
            urlPrefix,
          })
        : navPage === 'assessment'
          ? AssessmentSyncErrorsAndWarnings({
              authz_data,
              assessment: resLocals.assessment,
              courseInstance: resLocals.course_instance,
              course,
              urlPrefix,
            })
          : navPage === 'question'
            ? QuestionSyncErrorsAndWarnings({
                authz_data,
                question: resLocals.question,
                course,
                urlPrefix,
              })
            : '';
  const pageTitle =
    navPage === 'course_admin'
      ? 'Course Files'
      : navPage === 'instance_admin'
        ? 'Course Instance Files'
        : navPage === 'assessment'
          ? 'Assessment Files'
          : navPage === 'question'
            ? `Files (${resLocals.question.qid})`
            : 'Files';

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle })}
        <link href="${nodeModulesAssetPath('highlight.js/styles/default.css')}" rel="stylesheet" />
        ${compiledScriptTag('instructorFileBrowserClient.ts')}
        <style>
          .popover {
            max-width: 50%;
          }
        </style>
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${syncErrorsAndWarnings}
          <h1 class="sr-only">Files</h1>
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <div class="row align-items-center justify-content-between">
                <div class="col-auto text-monospace d-flex">
                  ${joinHtml(
                    paths.branch.map(
                      (dir) => html`
                        ${dir.canView
                          ? html`
                              <a
                                class="text-white"
                                href="${paths.urlPrefix}/file_view/${encodePath(dir.path)}"
                              >
                                ${dir.name}
                              </a>
                            `
                          : html`<span>${dir.name}</span>`}
                      `,
                    ),
                    html`<span class="mx-2">/</span>`,
                  )}
                </div>
                <div class="col-auto">
                  ${isFile
                    ? FileBrowserActions({ paths, fileInfo, csrfToken })
                    : paths.hasEditPermission
                      ? DirectoryBrowserActions({ paths, csrfToken })
                      : ''}
                </div>
              </div>
            </div>

            ${isFile
              ? html`<div class="card-body">${FileContentPreview({ paths, fileInfo })}</div>`
              : DirectoryBrowserBody({ paths, directoryListings, csrfToken })}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function FileBrowserActions({
  paths,
  fileInfo,
  csrfToken,
}: {
  paths: InstructorFilePaths;
  fileInfo: FileInfo;
  csrfToken: string;
}) {
  const encodedPath = encodePath(fileInfo.path);
  return html`
    <a
      tabindex="0"
      class="btn btn-sm btn-light ${fileInfo.canEdit ? '' : 'disabled'}"
      href="${paths.urlPrefix}/file_edit/${encodedPath}"
    >
      <i class="fa fa-edit"></i>
      <span>Edit</span>
    </a>
    <button
      type="button"
      class="btn btn-sm btn-light"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Upload file"
      data-content="${escapeHtml(FileUploadForm({ file: fileInfo, csrfToken }))}"
      data-trigger="click"
      ${fileInfo.canUpload ? '' : 'disabled'}
    >
      <i class="fa fa-arrow-up"></i>
      <span>Upload</span>
    </button>
    <a
      class="btn btn-sm btn-light ${fileInfo.canDownload ? '' : 'disabled'}"
      href="${paths.urlPrefix}/file_download/${encodedPath}?attachment=${encodeURIComponent(
        fileInfo.name,
      )}"
    >
      <i class="fa fa-arrow-down"></i>
      <span>Download</span>
    </a>
    <button
      type="button"
      class="btn btn-sm btn-light"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Rename file"
      data-content="${escapeHtml(
        FileRenameForm({ file: fileInfo, csrfToken, isViewingFile: true }),
      )}"
      data-trigger="click"
      ${fileInfo.canRename ? '' : 'disabled'}
    >
      <i class="fa fa-i-cursor"></i>
      <span>Rename</span>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-light"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Confirm delete"
      data-content="${escapeHtml(FileDeleteForm({ file: fileInfo, csrfToken }))}"
      data-trigger="click"
      ${fileInfo.canDelete ? '' : 'disabled'}
    >
      <i class="far fa-trash-alt"></i>
      <span>Delete</span>
    </button>
  `;
}

function DirectoryBrowserActions({
  paths,
  csrfToken,
}: {
  paths: InstructorFilePaths;
  csrfToken: string;
}) {
  return html`
    ${paths.specialDirs?.map(
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
          data-trigger="click"
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
          file: { id: 'New', working_path: paths.workingPath },
          csrfToken,
        }),
      )}"
      data-trigger="click"
    >
      <i class="fa fa-plus"></i>
      <span>Add new file</span>
    </button>
  `;
}

function FileContentPreview({
  paths,
  fileInfo,
}: {
  paths: InstructorFilePaths;
  fileInfo: FileInfo;
}) {
  if (fileInfo.isImage) {
    return html`
      <img
        src="${paths.urlPrefix}/file_download/${paths.workingPathRelativeToCourse}"
        class="img-fluid"
      />
    `;
  }
  if (fileInfo.isText) {
    return html`<pre><code>${unsafeHtml(fileInfo.contents ?? '')}</code></pre>`;
  }
  if (fileInfo.isPDF) {
    return html`
      <div class="embed-responsive embed-responsive-4by3">
        <iframe
          src="${paths.urlPrefix}/file_download/${paths.workingPathRelativeToCourse}?type=application/pdf#view=FitH"
          class="embed-responsive-item"
        >
          This PDF cannot be displayed.
        </iframe>
      </div>
    `;
  }
  return html`<div class="alert alert-warning" role="alert">No preview available.</div>`;
}

function DirectoryBrowserBody({
  paths,
  directoryListings: directoryListings,
  csrfToken,
}: {
  paths: InstructorFilePaths;
  directoryListings: DirectoryListings;
  csrfToken: string;
}) {
  return html`
    <table class="table table-sm table-hover" aria-label="Directories and files">
      <tbody>
        ${directoryListings.files?.map(
          (f) => html`
            <tr>
              <td>
                ${f.sync_errors
                  ? SyncProblemButton({
                      type: 'error',
                      output: f.sync_errors,
                    })
                  : f.sync_warnings
                    ? SyncProblemButton({
                        type: 'warning',
                        output: f.sync_warnings,
                      })
                    : ''}
                <span><i class="far fa-file-alt fa-fw"></i></span>
                ${f.canView
                  ? html`<a href="${paths.urlPrefix}/file_view/${encodePath(f.path)}">${f.name}</a>`
                  : html`<span>${f.name}</span>`}
              </td>
              <td>
                <a
                  class="btn btn-xs btn-secondary ${f.canEdit ? '' : 'disabled'}"
                  href="${paths.urlPrefix}/file_edit/${encodePath(f.path)}"
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
                  data-trigger="click"
                  ${f.canUpload ? '' : 'disabled'}
                >
                  <i class="fa fa-arrow-up"></i>
                  <span>Upload</span>
                </button>
                <a
                  class="btn btn-xs btn-secondary ${f.canDownload ? '' : 'disabled'}"
                  href="${paths.urlPrefix}/file_download/${encodePath(
                    f.path,
                  )}?attachment=${encodeURIComponent(f.name)}"
                >
                  <i class="fa fa-arrow-down"></i>
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  class="btn btn-xs btn-secondary"
                  data-toggle="popover"
                  data-container="body"
                  data-html="true"
                  data-placement="auto"
                  title="Rename file"
                  data-content="${escapeHtml(
                    FileRenameForm({ file: f, csrfToken, isViewingFile: false }),
                  )}"
                  data-trigger="click"
                  data-testid="rename-file-button"
                  ${f.canRename ? '' : 'disabled'}
                >
                  <i class="fa fa-i-cursor"></i>
                  <span>Rename</span>
                </button>
                <button
                  type="button"
                  class="btn btn-xs btn-secondary"
                  data-toggle="popover"
                  data-container="body"
                  data-html="true"
                  data-placement="auto"
                  title="Confirm delete"
                  data-content="${escapeHtml(FileDeleteForm({ file: f, csrfToken }))}"
                  data-trigger="click"
                  data-testid="delete-file-button"
                  ${f.canDelete ? '' : 'disabled'}
                >
                  <i class="far fa-trash-alt"></i>
                  <span>Delete</span>
                </button>
              </td>
            </tr>
          `,
        )}
        ${directoryListings.dirs.map(
          (d) => html`
            <tr>
              <td colspan="2">
                <i class="fa fa-folder fa-fw"></i>
                ${d.canView
                  ? html`<a href="${paths.urlPrefix}/file_view/${encodePath(d.path)}">${d.name}</a>`
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
      ${file.info ? html`<div class="form-group">${file.info}</div>` : ''}

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
        ${file.path != null
          ? html`<input type="hidden" name="file_path" value="${file.path}" />`
          : html`<input type="hidden" name="working_path" value="${file.working_path}" />`}
        <div class="text-right">
          <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
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
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
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
      ${isViewingFile ? html`<input type="hidden" name="was_viewing_file" value="true" />` : ''}
      <input type="hidden" name="old_file_name" value="${file.name}" />
      <div class="container p-0 mb-4">
        Use only letters, numbers, dashes, and underscores, with no spaces. A file extension is
        recommended, delimited by a period. If you want to move the file to a different directory,
        you can specify a relative path that is delimited by a forward slash and that includes
        "<code>..</code>".
      </div>
      <div class="form-group">
        <label for="renameFileInput${file.id}">Path:</label>
        <input
          type="text"
          class="form-control js-rename-input"
          id="renameFileInput${file.id}"
          name="new_file_name"
          value="${file.name}"
          data-original-value="${file.name}"
          size="${1.5 * file.name.length}"
          pattern="(?:[\\-A-Za-z0-9_]+|\\.\\.)(?:\\/(?:[\\-A-Za-z0-9_]+|\\.\\.))*(?:\\.[\\-A-Za-z0-9_]+)?"
          required
        />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
