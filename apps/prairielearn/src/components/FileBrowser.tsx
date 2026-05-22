import fs from 'fs-extra';
import { Fragment } from 'react';

import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { compiledScriptTag, nodeModulesAssetPath } from '../lib/assets.js';
import { config } from '../lib/config.js';
import {
  type DirectoryListings,
  type FileInfo,
  browseDirectory,
  browseFile,
} from '../lib/file-browser.js';
import type { InstructorFilePaths } from '../lib/instructorFiles.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';
import { encodePath } from '../lib/uri-util.js';

import { FileDeleteForm, FileRenameForm, FileUploadForm } from './FileBrowserForms.js';
import { PageLayout } from './PageLayout.js';
import { SyncProblemButton } from './SyncProblemButton.js';

export async function createFileBrowser({
  resLocals,
  paths,
  isReadOnly,
}: {
  resLocals: UntypedResLocals;
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

function FileBrowser({
  resLocals,
  paths,
  isFile,
  fileInfo,
  directoryListings,
  isReadOnly,
}: { resLocals: UntypedResLocals; paths: InstructorFilePaths; isReadOnly: boolean } & (
  | { isFile: true; fileInfo: FileInfo; directoryListings?: undefined }
  | { isFile: false; directoryListings: DirectoryListings; fileInfo?: undefined }
)) {
  const { navPage, __csrf_token: csrfToken } = resLocals;
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
    content: (
      <>
        <h1 className="visually-hidden">Files</h1>
        <div className="card mb-4">
          <div className="card-header bg-primary text-white">
            <div className="row align-items-center justify-content-between">
              <div className="col-auto font-monospace d-flex">
                {breadcrumbPaths.map((dir, index) => (
                  <Fragment key={dir.path}>
                    {dir.canView ? (
                      <a
                        className="text-white"
                        href={`${paths.urlPrefix}/file_view/${encodePath(dir.path)}`}
                      >
                        {dir.name}
                      </a>
                    ) : (
                      <span>{dir.name}</span>
                    )}
                    {index < breadcrumbPaths.length - 1 ? <span className="mx-2">/</span> : null}
                  </Fragment>
                ))}
              </div>
              <div className="col-auto">
                {isFile ? (
                  <FileBrowserActions
                    paths={paths}
                    fileInfo={fileInfo}
                    isReadOnly={isReadOnly}
                    csrfToken={csrfToken}
                  />
                ) : paths.hasEditPermission && !isReadOnly ? (
                  <DirectoryBrowserActions paths={paths} csrfToken={csrfToken} />
                ) : null}
              </div>
            </div>
          </div>

          {isFile ? (
            <div className="card-body">
              <FileContentPreview paths={paths} fileInfo={fileInfo} />
            </div>
          ) : (
            <DirectoryBrowserTable
              paths={paths}
              directoryListings={directoryListings}
              isReadOnly={isReadOnly}
              csrfToken={csrfToken}
            />
          )}
        </div>
      </>
    ),
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
  return (
    <div className="d-flex flex-wrap gap-2">
      {isReadOnly ? null : (
        <>
          <a
            tabIndex={0}
            className={`btn btn-sm btn-light ${fileInfo.canEdit ? '' : 'disabled'}`}
            href={`${paths.urlPrefix}/file_edit/${encodedPath}`}
          >
            <i className="fa fa-edit" />
            <span>Edit</span>
          </a>
          <button
            type="button"
            className="btn btn-sm btn-light"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Upload file"
            data-bs-content={FileUploadForm({
              file: fileInfo,
              csrfToken,
              maxFileSizeBytes: config.fileUploadMaxBytes,
            }).toString()}
            disabled={!fileInfo.canUpload}
          >
            <i className="fa fa-arrow-up" />
            <span>Upload</span>
          </button>
        </>
      )}
      <a
        className={`btn btn-sm btn-light ${fileInfo.canDownload ? '' : 'disabled'}`}
        href={`${paths.urlPrefix}/file_download/${encodedPath}?attachment=${encodeURIComponent(
          fileInfo.name,
        )}`}
      >
        <i className="fa fa-arrow-down" />
        <span>Download</span>
      </a>
      {isReadOnly ? null : (
        <>
          <button
            type="button"
            className="btn btn-sm btn-light"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Rename file"
            data-bs-content={FileRenameForm({
              file: fileInfo,
              csrfToken,
              isViewingFile: true,
            }).toString()}
            disabled={!fileInfo.canRename}
          >
            <i className="fa fa-i-cursor" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-light"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-placement="auto"
            data-bs-title="Confirm delete"
            data-bs-content={FileDeleteForm({ file: fileInfo, csrfToken }).toString()}
            disabled={!fileInfo.canDelete}
          >
            <i className="far fa-trash-alt" />
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  );
}

function DirectoryBrowserActions({
  paths,
  csrfToken,
}: {
  paths: InstructorFilePaths;
  csrfToken: string;
}) {
  return (
    <div className="d-flex flex-wrap gap-2">
      {paths.specialDirs.map((d) => (
        <button
          key={d.label}
          type="button"
          id={`instructorFileUploadForm-New${d.label}`}
          className="btn btn-sm btn-light"
          data-bs-toggle="popover"
          data-bs-container="body"
          data-bs-html="true"
          data-bs-placement="auto"
          data-bs-title="Upload file"
          data-bs-content={FileUploadForm({
            file: { id: `New${d.label}`, info: d.info, working_path: d.path },
            csrfToken,
            maxFileSizeBytes: config.fileUploadMaxBytes,
          }).toString()}
        >
          <i className="fa fa-plus" />
          <span>Add new {d.label.toLowerCase()} file</span>
        </button>
      ))}
      <button
        type="button"
        id="instructorFileUploadForm-New"
        className="btn btn-sm btn-light"
        data-bs-toggle="popover"
        data-bs-container="body"
        data-bs-html="true"
        data-bs-placement="auto"
        data-bs-title="Upload file"
        data-bs-content={FileUploadForm({
          file: { id: 'New', working_path: paths.workingPath },
          csrfToken,
          maxFileSizeBytes: config.fileUploadMaxBytes,
        }).toString()}
      >
        <i className="fa fa-plus" />
        <span>Add new file</span>
      </button>
    </div>
  );
}

function getDefaultFileViewUrl({
  paths,
  filePath,
}: {
  paths: InstructorFilePaths;
  filePath: string;
}) {
  const encodedPath = encodePath(filePath);
  return encodedPath === ''
    ? `${paths.urlPrefix}/file_view`
    : `${paths.urlPrefix}/file_view/${encodedPath}`;
}

function DirectoryBrowserTable({
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
  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover" aria-label="Directories and files">
        <thead className="visually-hidden">
          <tr>
            <th>File</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {directoryListings.files.map((f) => {
            const fileUrl = getDefaultFileViewUrl({ paths, filePath: f.path });
            const editFileUrl = `${paths.urlPrefix}/file_edit/${encodePath(f.path)}`;

            return (
              <tr key={`file-${f.path}`}>
                <td className="align-middle">
                  <div className="d-flex align-items-center">
                    <i className="far fa-file-alt" />
                    {f.sync_errors ? (
                      <SyncProblemButton type="error" output={f.sync_errors} />
                    ) : f.sync_warnings ? (
                      <SyncProblemButton type="warning" output={f.sync_warnings} />
                    ) : null}
                    {f.canView ? <a href={fileUrl}>{f.name}</a> : <span>{f.name}</span>}
                  </div>
                </td>
                <td className="align-middle">
                  <div className="d-flex gap-2 file-browser-row-actions">
                    {isReadOnly ? null : (
                      <>
                        {f.canEdit ? (
                          <a className="btn btn-xs btn-secondary text-nowrap" href={editFileUrl}>
                            <i className="fa fa-edit" />
                            <span>Edit</span>
                          </a>
                        ) : (
                          <span>
                            <button
                              type="button"
                              className="btn btn-xs btn-secondary text-nowrap"
                              disabled
                            >
                              <i className="fa fa-edit" />
                              <span>Edit</span>
                            </button>
                          </span>
                        )}
                        <button
                          type="button"
                          id={`instructorFileUploadForm-${f.id}`}
                          className="btn btn-xs btn-secondary text-nowrap"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-placement="auto"
                          data-bs-title="Upload file"
                          data-bs-content={FileUploadForm({
                            file: f,
                            csrfToken,
                            maxFileSizeBytes: config.fileUploadMaxBytes,
                          }).toString()}
                          disabled={!f.canUpload}
                        >
                          <i className="fa fa-arrow-up" />
                          <span>Upload</span>
                        </button>
                      </>
                    )}
                    <a
                      className={`btn btn-xs btn-secondary text-nowrap ${f.canDownload ? '' : 'disabled'}`}
                      href={`${paths.urlPrefix}/file_download/${encodePath(f.path)}?attachment=${encodeURIComponent(
                        f.name,
                      )}`}
                    >
                      <i className="fa fa-arrow-down" />
                      <span>Download</span>
                    </a>
                    {isReadOnly ? null : (
                      <>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary text-nowrap"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-placement="auto"
                          data-bs-title="Rename file"
                          data-bs-content={FileRenameForm({
                            file: f,
                            csrfToken,
                            isViewingFile: false,
                          }).toString()}
                          data-testid="rename-file-button"
                          disabled={!f.canRename}
                        >
                          <i className="fa fa-i-cursor" />
                          <span>Rename</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary text-nowrap"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-placement="auto"
                          data-bs-title="Confirm delete"
                          data-bs-content={FileDeleteForm({
                            file: f,
                            csrfToken,
                          }).toString()}
                          data-testid="delete-file-button"
                          disabled={!f.canDelete}
                        >
                          <i className="far fa-trash-alt" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {directoryListings.dirs.map((d) => {
            const directoryUrl = getDefaultFileViewUrl({ paths, filePath: d.path });

            return (
              <tr key={`dir-${d.path}`}>
                <td colSpan={2}>
                  <i className="fa fa-folder" />{' '}
                  {d.canView ? <a href={directoryUrl}>{d.name}</a> : <span>{d.name}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FileContentPreview({
  paths,
  fileInfo,
}: {
  paths: InstructorFilePaths;
  fileInfo: FileInfo;
}) {
  if (fileInfo.isImage) {
    return (
      <img
        src={`${paths.urlPrefix}/file_download/${paths.workingPathRelativeToCourse}`}
        className="img-fluid"
        alt={`Preview of ${fileInfo.name}`}
      />
    );
  }
  if (fileInfo.isText) {
    return (
      <pre>
        {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml */}
        <code dangerouslySetInnerHTML={{ __html: fileInfo.contents ?? '' }} />
      </pre>
    );
  }
  if (fileInfo.isPDF) {
    return (
      <div className="ratio ratio-4x3">
        <iframe
          src={`${paths.urlPrefix}/file_download/${paths.workingPathRelativeToCourse}?type=application/pdf#view=FitH`}
          title={`PDF preview of ${fileInfo.name}`}
        >
          This PDF cannot be displayed.
        </iframe>
      </div>
    );
  }
  return (
    <div className="alert alert-warning" role="alert">
      No preview available.
    </div>
  );
}
