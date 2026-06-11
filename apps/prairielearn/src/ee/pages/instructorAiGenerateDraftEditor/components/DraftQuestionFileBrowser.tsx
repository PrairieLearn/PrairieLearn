import { type MouseEvent } from 'react';

import { FileBrowserActionButton } from '../../../../components/FileBrowserActionButton.js';
import { SyncProblemButton } from '../../../../components/SyncProblemButton.js';
import type {
  DraftQuestionFileBrowserBreadcrumbSegment,
  DraftQuestionFileBrowserData,
  DraftQuestionFileBrowserDirectory,
  DraftQuestionFileBrowserFile,
} from '../../../../lib/draft-question-files/browser.js';
import {
  CODE_EDITOR_TAB_FILES,
  getEditorUrlForSelection,
} from '../../../../lib/draft-question-files/urls.js';

import {
  DeleteFileButton,
  type DraftQuestionFileBrowserActions,
  RenameFileButton,
  UploadFileButton,
} from './DraftQuestionFileBrowserActions.js';
import { DraftQuestionFileBrowserBreadcrumb } from './DraftQuestionFileBrowserBreadcrumb.js';

function DraftQuestionDirectoryActions({
  data,
  actions,
  disableActions,
}: {
  data: DraftQuestionFileBrowserData;
  actions: DraftQuestionFileBrowserActions;
  disableActions: boolean;
}) {
  return (
    <div className="d-flex flex-wrap gap-2">
      {data.specialDirs.map((d) => (
        <UploadFileButton
          key={d.label}
          id={`instructorFileUploadForm-New${d.label}`}
          label={`Add new ${d.label.toLowerCase()} file`}
          iconClass="fa fa-plus"
          className="btn btn-sm btn-outline-secondary"
          disabled={disableActions}
          infoDirectory={d.directory}
          maxFileSizeBytes={data.maxFileSizeBytes}
          target={{ kind: 'new', directory: d.directory }}
          urlPrefix={data.urlPrefix}
          onUploadFile={actions.onUploadFile}
        />
      ))}
      <UploadFileButton
        id="instructorFileUploadForm-New"
        label="Add new file"
        iconClass="fa fa-plus"
        className="btn btn-sm btn-outline-secondary"
        disabled={disableActions}
        maxFileSizeBytes={data.maxFileSizeBytes}
        target={{ kind: 'new', directory: data.selectedDirectory }}
        urlPrefix={data.urlPrefix}
        onUploadFile={actions.onUploadFile}
      />
    </div>
  );
}

function DraftQuestionFileRow({
  data,
  file,
  actions,
  search,
  disableActions,
  onSelectFile,
}: {
  data: DraftQuestionFileBrowserData;
  file: DraftQuestionFileBrowserFile;
  actions: DraftQuestionFileBrowserActions;
  search: string;
  disableActions: boolean;
  onSelectFile: (filePath: string) => void;
}) {
  const fileUrl = getEditorUrlForSelection({
    editorUrl: data.editorUrl,
    selection: { kind: 'file', path: file.selectedFilePath },
    search,
  });
  const isDisabled = file.disabledReason != null;
  // `question.html` and `server.py` are edited via the dedicated "Files" tab,
  // so the per-file editor / upload / rename / delete don't apply here. The
  // "Edit" link's URL routes to that tab; download is still allowed.
  const isManagedByCodeEditorTab = CODE_EDITOR_TAB_FILES.has(file.selectedFilePath);
  const canEdit = file.canEdit && !isDisabled;
  const canUpload = file.canUpload && !isDisabled && !disableActions && !isManagedByCodeEditorTab;
  const canRename = file.canRename && !isDisabled && !disableActions && !isManagedByCodeEditorTab;
  const canDelete = file.canDelete && !isDisabled && !disableActions && !isManagedByCodeEditorTab;

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
          {file.canView && !isDisabled ? (
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
            target={{ kind: 'replace', filePath: file.selectedFilePath }}
            urlPrefix={data.urlPrefix}
            onUploadFile={actions.onUploadFile}
          />
          <FileBrowserActionButton
            icon="fa fa-arrow-down"
            label="Download"
            href={file.downloadUrl}
            disabled={!file.canDownload}
          />
          <RenameFileButton
            id={`instructorFileRenameForm-${file.id}`}
            fileName={file.name}
            oldFilePath={file.selectedFilePath}
            disabled={!canRename}
            urlPrefix={data.urlPrefix}
            onRenameFile={actions.onRenameFile}
          />
          <DeleteFileButton
            id={`instructorFileDeleteForm-${file.id}`}
            fileName={file.name}
            filePath={file.selectedFilePath}
            disabled={!canDelete}
            urlPrefix={data.urlPrefix}
            onDeleteFile={actions.onDeleteFile}
          />
        </div>
      </td>
    </tr>
  );
}

function DraftQuestionDirectoryRow({
  directory,
  editorUrl,
  search,
  onSelectDirectory,
}: {
  directory: DraftQuestionFileBrowserDirectory;
  editorUrl: string;
  search: string;
  onSelectDirectory: (directory: string | null) => void;
}) {
  const directoryUrl = getEditorUrlForSelection({
    editorUrl,
    selection: { kind: 'dir', path: directory.selectedDirectory },
    search,
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
  breadcrumb,
  actions,
  search,
  disableActions = false,
  onSelectFile,
  onSelectDirectory,
}: {
  data: DraftQuestionFileBrowserData;
  breadcrumb: DraftQuestionFileBrowserBreadcrumbSegment[];
  actions: DraftQuestionFileBrowserActions;
  /** Current page query string, whose unrelated params the file links preserve. */
  search: string;
  /** Disables the upload/rename/delete actions (e.g. while a generation runs). */
  disableActions?: boolean;
  onSelectFile: (filePath: string) => void;
  onSelectDirectory: (directory: string | null) => void;
}) {
  return (
    <div className="h-100 d-flex flex-column">
      <div className="d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <DraftQuestionFileBrowserBreadcrumb
          segments={breadcrumb}
          editorUrl={data.editorUrl}
          search={search}
          ariaLabel="File browser breadcrumb"
          onSelectDirectory={onSelectDirectory}
        />
        {data.hasEditPermission ? (
          <DraftQuestionDirectoryActions
            data={data}
            actions={actions}
            disableActions={disableActions}
          />
        ) : null}
      </div>
      <div className="flex-grow-1 overflow-auto table-responsive">
        <table className="table table-sm table-hover mb-0" aria-label="Directories and files">
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
                search={search}
                disableActions={disableActions}
                onSelectFile={onSelectFile}
              />
            ))}
            {data.dirs.map((directory) => (
              <DraftQuestionDirectoryRow
                key={`dir-${directory.selectedDirectory ?? ''}`}
                directory={directory}
                editorUrl={data.editorUrl}
                search={search}
                onSelectDirectory={onSelectDirectory}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
