import { type MouseEvent } from 'react';

import { unsafeHtml } from '@prairielearn/html';

import {
  getEditorUrlWithSelectedDirectory,
  getEditorUrlWithSelectedFile,
} from '../lib/draft-question-file-url.js';

import { FileDeleteForm, FileRenameForm, FileUploadForm } from './FileBrowserForms.js';
import { SyncProblemButton } from './SyncProblemButton.js';

export interface DraftQuestionFileBrowserBreadcrumbSegment {
  name: string;
  /** Path relative to the question root; `null` for the question root. */
  directory: string | null;
  isActive: boolean;
}

export interface DraftQuestionFileBrowserFile {
  id: string | number;
  name: string;
  /** Path relative to the question root, identifying the file in the editor. */
  selectedFilePath: string;
  /** Path relative to the course root, used by the upload and delete forms. */
  coursePath: string;
  /** Absolute working directory, used by the rename form. */
  workingDirectory: string;
  downloadUrl: string;
  canView: boolean;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canRename: boolean;
  canDelete: boolean;
  syncErrors: string | null;
  syncWarnings: string | null;
  /** When set, the file is managed elsewhere (e.g. `info.json`) and cannot be edited. */
  disabledReason: string | null;
}

export interface DraftQuestionFileBrowserDirectory {
  name: string;
  /** Path relative to the question root. */
  selectedDirectory: string | null;
  canView: boolean;
}

export interface DraftQuestionFileBrowserSpecialDir {
  label: string;
  /** Absolute path used as the upload target. */
  path: string;
  /** Safe HTML describing where uploaded files are placed. */
  infoHtml: string;
}

export interface DraftQuestionFileBrowserData {
  isReadOnly: boolean;
  hasEditPermission: boolean;
  csrfToken: string;
  /** URL the popover forms POST to. */
  fileActionUrl: string;
  /** Base editor URL used to build file and directory links. */
  editorUrl: string;
  /** Absolute path of the directory being browsed; the default upload target. */
  workingPath: string;
  /** Path of the directory being browsed, relative to the question root. */
  selectedDirectory: string | null;
  /** Maximum upload size in bytes. */
  maxFileSizeBytes: number;
  breadcrumb: DraftQuestionFileBrowserBreadcrumbSegment[];
  specialDirs: DraftQuestionFileBrowserSpecialDir[];
  files: DraftQuestionFileBrowserFile[];
  dirs: DraftQuestionFileBrowserDirectory[];
}

function DraftQuestionDirectoryActions({
  data,
  redirectUrl,
}: {
  data: DraftQuestionFileBrowserData;
  redirectUrl: string;
}) {
  return (
    <div className="d-flex flex-wrap gap-2">
      {data.specialDirs.map((d) => (
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
            file: { id: `New${d.label}`, info: unsafeHtml(d.infoHtml), working_path: d.path },
            csrfToken: data.csrfToken,
            maxFileSizeBytes: data.maxFileSizeBytes,
            action: data.fileActionUrl,
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
          file: { id: 'New', working_path: data.workingPath },
          csrfToken: data.csrfToken,
          maxFileSizeBytes: data.maxFileSizeBytes,
          action: data.fileActionUrl,
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
  data,
  file,
  redirectUrl,
  onSelectFile,
}: {
  data: DraftQuestionFileBrowserData;
  file: DraftQuestionFileBrowserFile;
  redirectUrl: string;
  onSelectFile: (filePath: string) => void;
}) {
  const fileUrl = getEditorUrlWithSelectedFile({
    editorUrl: data.editorUrl,
    filePath: file.selectedFilePath,
  });
  const canEdit = file.canEdit && file.disabledReason == null;
  const canUpload = file.canUpload && file.disabledReason == null;
  const canRename = file.canRename && file.disabledReason == null;
  const canDelete = file.canDelete && file.disabledReason == null;

  const selectFile = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onSelectFile(file.selectedFilePath);
  };

  return (
    <tr>
      <td className="align-middle">
        <div className="d-flex align-items-center">
          <i className="far fa-file-alt" />
          {file.syncErrors ? (
            <SyncProblemButton type="error" output={file.syncErrors} />
          ) : file.syncWarnings ? (
            <SyncProblemButton type="warning" output={file.syncWarnings} />
          ) : null}
          {file.canView && file.disabledReason == null ? (
            <a href={fileUrl} onClick={selectFile}>
              {file.name}
            </a>
          ) : (
            <span
              className={file.disabledReason ? 'text-muted' : undefined}
              title={file.disabledReason ?? undefined}
            >
              {file.name}
            </span>
          )}
        </div>
      </td>
      <td className="align-middle">
        <div className="d-flex gap-2 file-browser-row-actions">
          {data.isReadOnly ? null : (
            <>
              {canEdit ? (
                <a
                  className="btn btn-xs btn-secondary text-nowrap"
                  href={fileUrl}
                  onClick={selectFile}
                >
                  <i className="fa fa-edit" />
                  <span>Edit</span>
                </a>
              ) : (
                <span title={file.disabledReason ?? undefined}>
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
                  file: { id: file.id, path: file.coursePath },
                  csrfToken: data.csrfToken,
                  maxFileSizeBytes: data.maxFileSizeBytes,
                  action: data.fileActionUrl,
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
            href={file.downloadUrl}
          >
            <i className="fa fa-arrow-down" />
            <span>Download</span>
          </a>
          {data.isReadOnly ? null : (
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
                  file: { id: file.id, name: file.name, dir: file.workingDirectory },
                  csrfToken: data.csrfToken,
                  isViewingFile: false,
                  action: data.fileActionUrl,
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
                  file: { id: file.id, name: file.name, path: file.coursePath },
                  csrfToken: data.csrfToken,
                  action: data.fileActionUrl,
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
  onSelectDirectory,
}: {
  directory: DraftQuestionFileBrowserDirectory;
  editorUrl: string;
  onSelectDirectory: (directory: string | null) => void;
}) {
  const directoryUrl = getEditorUrlWithSelectedDirectory({
    editorUrl,
    directory: directory.selectedDirectory,
  });

  return (
    <tr>
      <td colSpan={2}>
        <i className="fa fa-folder" />{' '}
        {directory.canView ? (
          <a
            href={directoryUrl}
            onClick={(event) => {
              event.preventDefault();
              onSelectDirectory(directory.selectedDirectory);
            }}
          >
            {directory.name}
          </a>
        ) : (
          <span>{directory.name}</span>
        )}
      </td>
    </tr>
  );
}

export function DraftQuestionFileBrowser({
  data,
  onSelectFile,
  onSelectDirectory,
}: {
  data: DraftQuestionFileBrowserData;
  onSelectFile: (filePath: string) => void;
  onSelectDirectory: (directory: string | null) => void;
}) {
  const redirectUrl = getEditorUrlWithSelectedDirectory({
    editorUrl: data.editorUrl,
    directory: data.selectedDirectory,
  });

  return (
    <>
      <nav aria-label="File browser breadcrumb" className="mb-2">
        <ol className="breadcrumb mb-0">
          {data.breadcrumb.map((segment) => (
            <li
              key={segment.directory ?? ''}
              className={`breadcrumb-item ${segment.isActive ? 'active' : ''}`}
              aria-current={segment.isActive ? 'page' : undefined}
            >
              {segment.isActive ? (
                segment.name
              ) : (
                <a
                  href={getEditorUrlWithSelectedDirectory({
                    editorUrl: data.editorUrl,
                    directory: segment.directory,
                  })}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelectDirectory(segment.directory);
                  }}
                >
                  {segment.name}
                </a>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {data.hasEditPermission && !data.isReadOnly ? (
        <div className="d-flex justify-content-end mb-2">
          <DraftQuestionDirectoryActions data={data} redirectUrl={redirectUrl} />
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
            {data.files.map((file) => (
              <DraftQuestionFileRow
                key={`file-${file.selectedFilePath}`}
                data={data}
                file={file}
                redirectUrl={redirectUrl}
                onSelectFile={onSelectFile}
              />
            ))}
            {data.dirs.map((directory) => (
              <DraftQuestionDirectoryRow
                key={`dir-${directory.selectedDirectory ?? ''}`}
                directory={directory}
                editorUrl={data.editorUrl}
                onSelectDirectory={onSelectDirectory}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
