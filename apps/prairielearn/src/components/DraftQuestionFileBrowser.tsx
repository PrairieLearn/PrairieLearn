import { type MouseEvent } from 'react';

import {
  getEditorUrlWithSelectedDirectory,
  getEditorUrlWithSelectedFile,
} from '../lib/draft-question-file-url.js';
import type {
  DraftQuestionFileBrowserData,
  DraftQuestionFileBrowserDirectory,
  DraftQuestionFileBrowserFile,
} from '../lib/draft-question-files.js';

import {
  DeleteFileButton,
  type DraftQuestionFileBrowserActions,
  RenameFileButton,
  UploadFileButton,
} from './DraftQuestionFileBrowserActions.js';
import { FileBrowserActionButton } from './FileBrowserActionButton.js';
import { SyncProblemButton } from './SyncProblemButton.js';

function DraftQuestionDirectoryActions({
  data,
  actions,
}: {
  data: DraftQuestionFileBrowserData;
  actions: DraftQuestionFileBrowserActions;
}) {
  return (
    <div className="d-flex flex-wrap gap-2">
      {data.specialDirs.map((d) => (
        <UploadFileButton
          key={d.label}
          id={`instructorFileUploadForm-New${d.label}`}
          label={`Add new ${d.label.toLowerCase()} file`}
          iconClass="fa fa-plus"
          className="btn btn-sm btn-light"
          infoDirectory={d.directory}
          maxFileSizeBytes={data.maxFileSizeBytes}
          targetFilePath={null}
          directory={d.directory}
          onUploadFile={actions.onUploadFile}
        />
      ))}
      <UploadFileButton
        id="instructorFileUploadForm-New"
        label="Add new file"
        iconClass="fa fa-plus"
        className="btn btn-sm btn-light"
        maxFileSizeBytes={data.maxFileSizeBytes}
        targetFilePath={null}
        directory={data.selectedDirectory}
        onUploadFile={actions.onUploadFile}
      />
    </div>
  );
}

function DraftQuestionFileRow({
  data,
  file,
  actions,
  onSelectFile,
}: {
  data: DraftQuestionFileBrowserData;
  file: DraftQuestionFileBrowserFile;
  actions: DraftQuestionFileBrowserActions;
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
              <FileBrowserActionButton
                icon="fa fa-edit"
                label="Edit"
                href={fileUrl}
                disabled={!canEdit}
                disabledTitle={file.disabledReason ?? undefined}
                onClick={selectFile}
              />
              <UploadFileButton
                id={`instructorFileUploadForm-${file.id}`}
                label="Upload"
                iconClass="fa fa-arrow-up"
                className="btn btn-xs btn-secondary text-nowrap"
                disabled={!canUpload}
                maxFileSizeBytes={data.maxFileSizeBytes}
                targetFilePath={file.selectedFilePath}
                directory={null}
                onUploadFile={actions.onUploadFile}
              />
            </>
          )}
          <FileBrowserActionButton
            icon="fa fa-arrow-down"
            label="Download"
            href={file.downloadUrl}
            disabled={!file.canDownload}
          />
          {data.isReadOnly ? null : (
            <>
              <RenameFileButton
                id={`instructorFileRenameForm-${file.id}`}
                fileName={file.name}
                oldFilePath={file.selectedFilePath}
                disabled={!canRename}
                onRenameFile={actions.onRenameFile}
              />
              <DeleteFileButton
                id={`instructorFileDeleteForm-${file.id}`}
                fileName={file.name}
                filePath={file.selectedFilePath}
                disabled={!canDelete}
                onDeleteFile={actions.onDeleteFile}
              />
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
  actions,
  onSelectFile,
  onSelectDirectory,
}: {
  data: DraftQuestionFileBrowserData;
  actions: DraftQuestionFileBrowserActions;
  onSelectFile: (filePath: string) => void;
  onSelectDirectory: (directory: string | null) => void;
}) {
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
          <DraftQuestionDirectoryActions data={data} actions={actions} />
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
                actions={actions}
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
