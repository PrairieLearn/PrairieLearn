import * as path from 'node:path';

import * as async from 'async';
import { fileTypeFromFile } from 'file-type';
import { filesize } from 'filesize';
import fs from 'fs-extra';
import hljs from 'highlight.js';
import { isBinaryFile } from 'isbinaryfile';

import { type HtmlValue, escapeHtml, html, joinHtml, unsafeHtml } from '@prairielearn/html';
import { contains } from '@prairielearn/path-utils';
import { run } from '@prairielearn/run';

import { compiledScriptTag, nodeModulesAssetPath } from '../lib/assets.js';
import { config } from '../lib/config.js';
import * as editorUtil from '../lib/editorUtil.js';
import type { InstructorFilePaths } from '../lib/instructorFiles.js';
import { renderHtml } from '../lib/preact-html.js';
import { encodePath } from '../lib/uri-util.js';

import { PageLayout } from './PageLayout.html.js';
import {
  AssessmentSyncErrorsAndWarnings,
  CourseInstanceSyncErrorsAndWarnings,
  CourseSyncErrorsAndWarnings,
  QuestionSyncErrorsAndWarnings,
} from './SyncErrorsAndWarnings.html.js';
import { SyncProblemButton } from './SyncProblemButton.html.js';

interface FileInfo {
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

interface DirectoryEntry {
  id: string | number;
  name: string;
  path: string;
  canView: boolean;
}

interface DirectoryEntryDirectory extends DirectoryEntry {
  isFile: false;
}

interface DirectoryEntryFile extends DirectoryEntry {
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

interface DirectoryListings {
  dirs: DirectoryEntryDirectory[];
  files: DirectoryEntryFile[];
}

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

export async function browseDirectory({
  paths,
}: {
  paths: InstructorFilePaths;
}): Promise<DirectoryListings> {
  const filenames = await fs.readdir(paths.workingPath);
  const all_files = await async.mapLimit(
    filenames.sort().map((name, index) => ({ name, index })),
    3,
    async (file: { name: string; index: number }) => {
      const filepath = path.join(paths.workingPath, file.name);
      const stats = await fs.lstat(filepath);
      if (stats.isFile()) {
        const editable = !(await isBinaryFile(filepath));
        const movable = !paths.cannotMove.includes(filepath);
        const relative_path = path.relative(paths.coursePath, filepath);
        const sync_data = await editorUtil.getErrorsAndWarningsForFilePath(
          paths.courseId,
          relative_path,
        );
        return {
          id: file.index,
          name: file.name,
          isFile: true,
          path: relative_path,
          dir: paths.workingPath,
          canEdit: editable && paths.hasEditPermission,
          canUpload: paths.hasEditPermission,
          canDownload: true, // we already know the user is a course Viewer (checked on GET)
          canRename: movable && paths.hasEditPermission,
          canDelete: movable && paths.hasEditPermission,
          canView: !paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
          sync_errors: sync_data.errors,
          sync_warnings: sync_data.warnings,
        } as DirectoryEntryFile;
      } else if (stats.isDirectory()) {
        // The .git directory is hidden in the browser interface.
        if (file.name === '.git') return null;
        return {
          id: file.index,
          name: file.name,
          isFile: false,
          path: path.relative(paths.coursePath, filepath),
          canView: !paths.invalidRootPaths.some((invalidRootPath) =>
            contains(invalidRootPath, filepath),
          ),
        } as DirectoryEntryDirectory;
      } else {
        return null;
      }
    },
  );
  return {
    files: all_files.filter((f) => f?.isFile === true),
    dirs: all_files.filter((f) => f?.isFile === false),
  };
}

export async function browseFile({ paths }: { paths: InstructorFilePaths }): Promise<FileInfo> {
  const filepath = paths.workingPath;
  const movable = !paths.cannotMove.includes(filepath);
  const file: FileInfo = {
    id: 0,
    name: path.basename(paths.workingPath),
    path: path.relative(paths.coursePath, filepath),
    dir: path.dirname(paths.workingPath),
    canEdit: false, // will be overridden only if the file is a text file
    canUpload: paths.hasEditPermission,
    canDownload: true, // we already know the user is a course Viewer (checked on GET)
    canRename: movable && paths.hasEditPermission,
    canDelete: movable && paths.hasEditPermission,
    canView: !paths.invalidRootPaths.some((invalidRootPath) => contains(invalidRootPath, filepath)),
    isBinary: await isBinaryFile(paths.workingPath),
    isImage: false,
    isPDF: false,
    isText: false,
  };

  if (file.isBinary) {
    const type = await fileTypeFromFile(paths.workingPath);
    if (type) {
      if (type?.mime.startsWith('image')) {
        file.isImage = true;
      } else if (type?.mime === 'application/pdf') {
        file.isPDF = true;
      }
    }
  } else {
    // This is probably a text file. If it's is larger that 1MB, don't
    // attempt to read it; treat it like an opaque binary file.
    const { size } = await fs.stat(paths.workingPath);
    if (size > 1 * 1024 * 1024) {
      return { ...file, isBinary: true };
    }

    file.isText = true;
    file.canEdit = paths.hasEditPermission;

    const fileContents = await fs.readFile(paths.workingPath);
    const stringifiedContents = fileContents.toString('utf8');

    // Try to guess the language from the file extension. This takes
    // advantage of the fact that Highlight.js includes common file extensions
    // as aliases for each supported language, and `getLanguage()` allows
    // us to look up a language by its alias.
    //
    // If we don't get a match, we'll try to guess the language by running
    // `highlightAuto()` on the first few thousand characters of the file.
    //
    // Note that we deliberately exclude `ml` and `ls` from the extensions
    // that we try to guess from, as they're ambiguous (OCaml/Standard ML
    // and LiveScript/Lasso, respectively). For more details, see
    // https://highlightjs.readthedocs.io/en/latest/supported-languages.html
    let language: string | undefined = undefined;
    const extension = path.extname(paths.workingPath).substring(1);
    if (!['ml', 'ls'].includes(extension) && hljs.getLanguage(extension)) {
      language = extension;
    } else {
      const result = hljs.highlightAuto(stringifiedContents.slice(0, 2000));
      language = result.language;
    }
    file.contents = hljs.highlight(stringifiedContents, {
      language: language ?? 'plaintext',
    }).value;
  }

  return file;
}

export async function createFileBrowser({
  resLocals,
  paths,
  isReadOnly,
}: {
  resLocals: Record<string, any>;
  paths: InstructorFilePaths;
  isReadOnly: boolean;
}) {
  const stats = await fs.lstat(paths.workingPath);
  if (stats.isDirectory()) {
    return FileBrowser({
      resLocals,
      paths,
      isFile: false,
      directoryListings: await browseDirectory({ paths }),
      isReadOnly,
    });
  } else if (stats.isFile()) {
    return FileBrowser({
      resLocals,
      paths,
      isFile: true,
      fileInfo: await browseFile({ paths }),
      isReadOnly,
    });
  } else {
    throw new Error(
      `Invalid working path - ${paths.workingPath} is neither a directory nor a file`,
    );
  }
}

export function FileBrowser({
  resLocals,
  paths,
  isFile,
  fileInfo,
  directoryListings,
  isReadOnly,
}: { resLocals: Record<string, any>; paths: InstructorFilePaths; isReadOnly: boolean } & (
  | { isFile: true; fileInfo: FileInfo; directoryListings?: undefined }
  | { isFile: false; directoryListings: DirectoryListings; fileInfo?: undefined }
)) {
  const { navPage, __csrf_token: csrfToken, authz_data, course, urlPrefix } = resLocals;
  const syncErrorsAndWarnings =
    navPage === 'course_admin'
      ? renderHtml(
          <CourseSyncErrorsAndWarnings
            authz_data={authz_data}
            course={course}
            urlPrefix={urlPrefix}
          />,
        )
      : navPage === 'instance_admin'
        ? renderHtml(
            <CourseInstanceSyncErrorsAndWarnings
              authz_data={authz_data}
              courseInstance={resLocals.course_instance}
              course={course}
              urlPrefix={urlPrefix}
            />,
          )
        : navPage === 'assessment'
          ? renderHtml(
              <AssessmentSyncErrorsAndWarnings
                authz_data={authz_data}
                assessment={resLocals.assessment}
                courseInstance={resLocals.course_instance}
                course={course}
                urlPrefix={urlPrefix}
              />,
            )
          : navPage === 'question' || navPage === 'public_question'
            ? renderHtml(
                <QuestionSyncErrorsAndWarnings
                  authz_data={authz_data}
                  question={resLocals.question}
                  course={course}
                  urlPrefix={urlPrefix}
                />,
              )
            : '';
  const pageTitle =
    navPage === 'course_admin'
      ? 'Course Files'
      : navPage === 'instance_admin'
        ? 'Course Instance Files'
        : navPage === 'assessment'
          ? 'Assessment Files'
          : navPage === 'question' || navPage === 'public_question'
            ? `Files (${resLocals.question.qid})`
            : 'Files';

  const breadcrumbPaths = run(() => {
    // We only include the root path if it's viewable on the current page.
    // Otherwise we hide it to keep the breadcrumb more concise.
    if (paths.branch[0].canView) return paths.branch;

    return paths.branch.slice(1);
  });

  return PageLayout({
    resLocals,
    pageTitle,
    navContext: {
      type: resLocals.navbarType,
      page: navPage,
      subPage: 'file_view',
    },
    options: {
      fullWidth: true,
    },
    preContent: html`
      <link href="${nodeModulesAssetPath('highlight.js/styles/default.css')}" rel="stylesheet" />
      ${compiledScriptTag('instructorFileBrowserClient.ts')}
      <style>
        .popover {
          max-width: 50%;
        }
      </style>
    `,
    content: html`
      ${syncErrorsAndWarnings}
      <h1 class="visually-hidden">Files</h1>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <div class="row align-items-center justify-content-between">
            <div class="col-auto font-monospace d-flex">
              ${joinHtml(
                breadcrumbPaths.map(
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
                ? FileBrowserActions({ paths, fileInfo, isReadOnly, csrfToken })
                : paths.hasEditPermission && !isReadOnly
                  ? DirectoryBrowserActions({ paths, csrfToken })
                  : ''}
            </div>
          </div>
        </div>

        ${isFile
          ? html`<div class="card-body">${FileContentPreview({ paths, fileInfo })}</div>`
          : DirectoryBrowserBody({ paths, directoryListings, isReadOnly, csrfToken })}
      </div>
    `,
  });
}

function FileBrowserActions({
  paths,
  fileInfo,
  isReadOnly,
  csrfToken,
}: {
  paths: InstructorFilePaths;
  fileInfo: FileInfo;
  isReadOnly: boolean;
  csrfToken: string;
}) {
  const encodedPath = encodePath(fileInfo.path);
  return html`
    ${isReadOnly
      ? ''
      : html`
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
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Upload file"
            data-bs-content="${escapeHtml(FileUploadForm({ file: fileInfo, csrfToken }))}"
            ${fileInfo.canUpload ? '' : 'disabled'}
          >
            <i class="fa fa-arrow-up"></i>
            <span>Upload</span>
          </button>
        `}
    <a
      class="btn btn-sm btn-light ${fileInfo.canDownload ? '' : 'disabled'}"
      href="${paths.urlPrefix}/file_download/${encodedPath}?attachment=${encodeURIComponent(
        fileInfo.name,
      )}"
    >
      <i class="fa fa-arrow-down"></i>
      <span>Download</span>
    </a>
    ${isReadOnly
      ? ''
      : html`
          <button
            type="button"
            class="btn btn-sm btn-light"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Rename file"
            data-bs-content="${escapeHtml(
              FileRenameForm({ file: fileInfo, csrfToken, isViewingFile: true }),
            )}"
            ${fileInfo.canRename ? '' : 'disabled'}
          >
            <i class="fa fa-i-cursor"></i>
            <span>Rename</span>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-light"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Confirm delete"
            data-bs-content="${escapeHtml(FileDeleteForm({ file: fileInfo, csrfToken }))}"
            ${fileInfo.canDelete ? '' : 'disabled'}
          >
            <i class="far fa-trash-alt"></i>
            <span>Delete</span>
          </button>
        `}
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
          data-bs-toggle="popover"
          data-bs-container="body"
          data-bs-html="true"
          data-bs-placement="auto"
          data-bs-title="Upload file"
          data-bs-content="${escapeHtml(
            FileUploadForm({
              file: { id: `New${d.label}`, info: d.info, working_path: d.path },
              csrfToken,
            }),
          )}
          "
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
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-placement="auto"
      data-bs-title="Upload file"
      data-bs-content="${escapeHtml(
        FileUploadForm({
          file: { id: 'New', working_path: paths.workingPath },
          csrfToken,
        }),
      )}"
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
      <div class="ratio ratio-4x3">
        <iframe
          src="${paths.urlPrefix}/file_download/${paths.workingPathRelativeToCourse}?type=application/pdf#view=FitH"
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
  directoryListings,
  isReadOnly,
  csrfToken,
}: {
  paths: InstructorFilePaths;
  directoryListings: DirectoryListings;
  isReadOnly: boolean;
  csrfToken: string;
}) {
  return html`
    <table class="table table-sm table-hover" aria-label="Directories and files">
      <thead class="visually-hidden">
        <tr>
          <th>File</th>
          <th>Actions</th>
        </tr>
      </thead>
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
                ${isReadOnly
                  ? ''
                  : html`
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
                        data-bs-toggle="popover"
                        data-bs-container="body"
                        data-bs-html="true"
                        data-bs-placement="auto"
                        data-bs-title="Upload file"
                        data-bs-content="
                  ${escapeHtml(FileUploadForm({ file: f, csrfToken }))}"
                        ${f.canUpload ? '' : 'disabled'}
                      >
                        <i class="fa fa-arrow-up"></i>
                        <span>Upload</span>
                      </button>
                    `}
                <a
                  class="btn btn-xs btn-secondary ${f.canDownload ? '' : 'disabled'}"
                  href="${paths.urlPrefix}/file_download/${encodePath(
                    f.path,
                  )}?attachment=${encodeURIComponent(f.name)}"
                >
                  <i class="fa fa-arrow-down"></i>
                  <span>Download</span>
                </a>
                ${isReadOnly
                  ? ''
                  : html`
                      <button
                        type="button"
                        class="btn btn-xs btn-secondary"
                        data-bs-toggle="popover"
                        data-bs-container="body"
                        data-bs-html="true"
                        data-bs-placement="auto"
                        data-bs-title="Rename file"
                        data-bs-content="${escapeHtml(
                          FileRenameForm({ file: f, csrfToken, isViewingFile: false }),
                        )}"
                        data-testid="rename-file-button"
                        ${f.canRename ? '' : 'disabled'}
                      >
                        <i class="fa fa-i-cursor"></i>
                        <span>Rename</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-xs btn-secondary"
                        data-bs-toggle="popover"
                        data-bs-container="body"
                        data-bs-html="true"
                        data-bs-placement="auto"
                        data-bs-title="Confirm delete"
                        data-bs-content="${escapeHtml(FileDeleteForm({ file: f, csrfToken }))}"
                        data-testid="delete-file-button"
                        ${f.canDelete ? '' : 'disabled'}
                      >
                        <i class="far fa-trash-alt"></i>
                        <span>Delete</span>
                      </button>
                    `}
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
          Max file size: ${filesize(config.fileUploadMaxBytes, { base: 10, round: 0 })}
        </small>
      </div>

      <div class="mb-3">
        <input type="hidden" name="__action" value="upload_file" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        ${file.path != null
          ? html`<input type="hidden" name="file_path" value="${file.path}" />`
          : html`<input type="hidden" name="working_path" value="${file.working_path}" />`}
        <div class="text-end">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
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
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
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
          pattern="(?:[\\-A-Za-z0-9_]+|\\.\\.)(?:\\/(?:[\\-A-Za-z0-9_]+|\\.\\.))*(?:\\.[\\-A-Za-z0-9_]+)?"
          required
        />
      </div>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
