import * as path from 'node:path';

import { type HtmlSafeString } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';

import {
  getEditorUrlWithSelectedDirectory,
  getEditorUrlWithSelectedFile,
} from '../lib/draft-question-file-url.js';
import type { InstructorFilePaths } from '../lib/instructorFiles.js';
import { encodePath } from '../lib/uri-util.js';

import {
  type DirectoryEntryDirectory,
  type DirectoryEntryFile,
  type DirectoryListings,
  FileDeleteForm,
  FileRenameForm,
  FileUploadForm,
  browseDirectory,
} from './FileBrowser.js';
import { SyncProblemButton } from './SyncProblemButton.js';

function getQuestionRelativePath(questionRootPath: string, courseRelativePath: string) {
  return path.posix.relative(questionRootPath, courseRelativePath.split(path.sep).join('/'));
}

function getSelectedDirectory(questionRootPath: string, courseRelativePath: string) {
  const relativePath = getQuestionRelativePath(questionRootPath, courseRelativePath);
  return relativePath === '' ? null : relativePath;
}

function DraftQuestionDirectoryActions({
  paths,
  csrfToken,
  fileActionUrl,
  redirectUrl,
}: {
  paths: InstructorFilePaths;
  csrfToken: string;
  fileActionUrl: string;
  redirectUrl: string;
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
            action: fileActionUrl,
            redirectUrl,
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
          action: fileActionUrl,
          redirectUrl,
        }).toString()}
      >
        <i className="fa fa-plus" />
        <span>Add new file</span>
      </button>
    </div>
  );
}

function DraftQuestionFileRow({
  paths,
  file,
  csrfToken,
  editorUrl,
  fileActionUrl,
  redirectUrl,
  questionRootPath,
  disabledInfoJsonReason,
  isReadOnly,
}: {
  paths: InstructorFilePaths;
  file: DirectoryEntryFile;
  csrfToken: string;
  editorUrl: string;
  fileActionUrl: string;
  redirectUrl: string;
  questionRootPath: string;
  disabledInfoJsonReason: string;
  isReadOnly: boolean;
}) {
  const selectedFilePath = getQuestionRelativePath(questionRootPath, file.path);
  const fileDisabledReason =
    path.posix.normalize(selectedFilePath) === 'info.json' ? disabledInfoJsonReason : null;
  const fileUrl = getEditorUrlWithSelectedFile({ editorUrl, filePath: selectedFilePath });
  const canEdit = file.canEdit && fileDisabledReason == null;
  const canUpload = file.canUpload && fileDisabledReason == null;
  const canRename = file.canRename && fileDisabledReason == null;
  const canDelete = file.canDelete && fileDisabledReason == null;

  return (
    <tr>
      <td className="align-middle">
        <div className="d-flex align-items-center">
          <i className="far fa-file-alt" />
          {file.sync_errors ? (
            <SyncProblemButton type="error" output={file.sync_errors} />
          ) : file.sync_warnings ? (
            <SyncProblemButton type="warning" output={file.sync_warnings} />
          ) : null}
          {file.canView && fileDisabledReason == null ? (
            <a href={fileUrl} data-selected-file-path={selectedFilePath}>
              {file.name}
            </a>
          ) : (
            <span
              className={fileDisabledReason ? 'text-muted' : undefined}
              title={fileDisabledReason ?? undefined}
            >
              {file.name}
            </span>
          )}
        </div>
      </td>
      <td className="align-middle">
        <div className="d-flex gap-2 file-browser-row-actions">
          {isReadOnly ? null : (
            <>
              {canEdit ? (
                <a
                  className="btn btn-xs btn-secondary text-nowrap"
                  href={fileUrl}
                  data-selected-file-path={selectedFilePath}
                >
                  <i className="fa fa-edit" />
                  <span>Edit</span>
                </a>
              ) : (
                <span title={fileDisabledReason ?? undefined}>
                  <button type="button" className="btn btn-xs btn-secondary text-nowrap" disabled>
                    <i className="fa fa-edit" />
                    <span>Edit</span>
                  </button>
                </span>
              )}
              <button
                type="button"
                id={`instructorFileUploadForm-${file.id}`}
                className="btn btn-xs btn-secondary text-nowrap"
                data-bs-toggle="popover"
                data-bs-container="body"
                data-bs-html="true"
                data-bs-placement="auto"
                data-bs-title="Upload file"
                data-bs-content={FileUploadForm({
                  file,
                  csrfToken,
                  action: fileActionUrl,
                  redirectUrl,
                }).toString()}
                disabled={!canUpload}
              >
                <i className="fa fa-arrow-up" />
                <span>Upload</span>
              </button>
            </>
          )}
          <a
            className={`btn btn-xs btn-secondary text-nowrap ${file.canDownload ? '' : 'disabled'}`}
            href={`${paths.urlPrefix}/file_download/${encodePath(file.path)}?attachment=${encodeURIComponent(
              file.name,
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
                  file,
                  csrfToken,
                  isViewingFile: false,
                  action: fileActionUrl,
                  redirectUrl,
                }).toString()}
                data-testid="rename-file-button"
                disabled={!canRename}
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
                  file,
                  csrfToken,
                  action: fileActionUrl,
                  redirectUrl,
                }).toString()}
                data-testid="delete-file-button"
                disabled={!canDelete}
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
}

function DraftQuestionDirectoryRow({
  directory,
  editorUrl,
  questionRootPath,
}: {
  directory: DirectoryEntryDirectory;
  editorUrl: string;
  questionRootPath: string;
}) {
  const selectedDirectory = getSelectedDirectory(questionRootPath, directory.path);
  const directoryUrl = getEditorUrlWithSelectedDirectory({
    editorUrl,
    directory: selectedDirectory,
  });

  return (
    <tr>
      <td colSpan={2}>
        <i className="fa fa-folder" />{' '}
        {directory.canView ? (
          <a href={directoryUrl} data-selected-directory-path={selectedDirectory ?? undefined}>
            {directory.name}
          </a>
        ) : (
          <span>{directory.name}</span>
        )}
      </td>
    </tr>
  );
}

function DraftQuestionFileBrowser({
  paths,
  directoryListings,
  isReadOnly,
  csrfToken,
  editorUrl,
  fileActionUrl,
  questionRootPath,
  selectedDirectory,
  disabledInfoJsonReason,
}: {
  paths: InstructorFilePaths;
  directoryListings: DirectoryListings;
  isReadOnly: boolean;
  csrfToken: string;
  editorUrl: string;
  fileActionUrl: string;
  questionRootPath: string;
  selectedDirectory: string | null;
  disabledInfoJsonReason: string;
}) {
  const redirectUrl = getEditorUrlWithSelectedDirectory({
    editorUrl,
    directory: selectedDirectory,
  });

  return (
    <>
      <nav aria-label="File browser breadcrumb" className="mb-2">
        <ol className="breadcrumb mb-0">
          {paths.branch
            .filter((dir) => dir.canView)
            .map((dir, index, dirs) => {
              const breadcrumbDirectory = getSelectedDirectory(questionRootPath, dir.path);
              const directoryUrl = getEditorUrlWithSelectedDirectory({
                editorUrl,
                directory: breadcrumbDirectory,
              });

              return (
                <li
                  key={dir.path}
                  className={`breadcrumb-item ${index === dirs.length - 1 ? 'active' : ''}`}
                  aria-current={index === dirs.length - 1 ? 'page' : undefined}
                >
                  {index === dirs.length - 1 ? (
                    dir.name
                  ) : (
                    <a href={directoryUrl} data-selected-directory-path={breadcrumbDirectory ?? ''}>
                      {dir.name}
                    </a>
                  )}
                </li>
              );
            })}
        </ol>
      </nav>
      {paths.hasEditPermission && !isReadOnly ? (
        <div className="d-flex justify-content-end mb-2">
          <DraftQuestionDirectoryActions
            paths={paths}
            csrfToken={csrfToken}
            fileActionUrl={fileActionUrl}
            redirectUrl={redirectUrl}
          />
        </div>
      ) : null}
      <div className="table-responsive">
        <table className="table table-sm table-hover" aria-label="Directories and files">
          <thead className="visually-hidden">
            <tr>
              <th>File</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {directoryListings.files.map((file) => (
              <DraftQuestionFileRow
                key={`file-${file.path}`}
                paths={paths}
                file={file}
                csrfToken={csrfToken}
                editorUrl={editorUrl}
                fileActionUrl={fileActionUrl}
                redirectUrl={redirectUrl}
                questionRootPath={questionRootPath}
                disabledInfoJsonReason={disabledInfoJsonReason}
                isReadOnly={isReadOnly}
              />
            ))}
            {directoryListings.dirs.map((directory) => (
              <DraftQuestionDirectoryRow
                key={`dir-${directory.path}`}
                directory={directory}
                editorUrl={editorUrl}
                questionRootPath={questionRootPath}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export async function createDraftQuestionFileBrowserHtml({
  paths,
  isReadOnly,
  csrfToken,
  editorUrl,
  fileActionUrl,
  questionRootPath,
  selectedDirectory,
  disabledInfoJsonReason,
}: {
  paths: InstructorFilePaths;
  isReadOnly: boolean;
  csrfToken: string;
  editorUrl: string;
  fileActionUrl: string;
  questionRootPath: string;
  selectedDirectory: string | null;
  disabledInfoJsonReason: string;
}): Promise<HtmlSafeString> {
  return renderHtml(
    <DraftQuestionFileBrowser
      paths={paths}
      directoryListings={await browseDirectory({ paths })}
      isReadOnly={isReadOnly}
      csrfToken={csrfToken}
      editorUrl={editorUrl}
      fileActionUrl={fileActionUrl}
      questionRootPath={questionRootPath}
      selectedDirectory={selectedDirectory}
      disabledInfoJsonReason={disabledInfoJsonReason}
    />,
  );
}
