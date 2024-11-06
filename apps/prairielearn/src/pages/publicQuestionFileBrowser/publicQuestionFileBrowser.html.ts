import { html, type HtmlValue, joinHtml, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
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

export function PublicQuestionFileBrowser({
  resLocals,
  paths,
  isFile,
  fileInfo,
  directoryListings,
}: { resLocals: Record<string, any>; paths: InstructorFilePaths } & (
  | { isFile: true; fileInfo: FileInfo; directoryListings?: undefined }
  | { isFile: false; directoryListings: DirectoryListings; fileInfo?: undefined }
)) {
  const { __csrf_token: csrfToken } = resLocals;
  const pageTitle = `Files (${resLocals.question.qid})`;

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
                  ${isFile ? FileBrowserActions({ paths, fileInfo, csrfToken }) : ''}
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
}: {
  paths: InstructorFilePaths;
  fileInfo: FileInfo;
  csrfToken: string;
}) {
  const encodedPath = encodePath(fileInfo.path);
  return html`
    <a
      class="btn btn-sm btn-light ${fileInfo.canDownload ? '' : 'disabled'}"
      href="${paths.urlPrefix}/file_download/${encodedPath}?attachment=${encodeURIComponent(
        fileInfo.name,
      )}"
    >
      <i class="fa fa-arrow-down"></i>
      <span>Download</span>
    </a>
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
                  class="btn btn-xs btn-secondary ${f.canDownload ? '' : 'disabled'}"
                  href="${paths.urlPrefix}/file_download/${encodePath(
                    f.path,
                  )}?attachment=${encodeURIComponent(f.name)}"
                >
                  <i class="fa fa-arrow-down"></i>
                  <span>Download</span>
                </a>
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
