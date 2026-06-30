import { type MouseEvent } from 'react';

import { FileBrowserActionButton } from '../../../../components/FileBrowserActionButton.js';
import { SyncProblemButton } from '../../../../components/SyncProblemButton.js';
import type {
  DraftQuestionFileBrowserData,
  DraftQuestionFileBrowserDirectory,
  DraftQuestionFileBrowserFile,
} from '../../../../lib/draft-question-files/browser.js';
import { CODE_EDITOR_TAB_FILES } from '../../../../lib/draft-question-files/paths.shared.js';
import { getDraftQuestionFileUrls } from '../../../../lib/draft-question-files/urls.js';

import {
  DeleteFileButton,
  type DraftQuestionFileBrowserActions,
  RenameFileButton,
  UploadFileButton,
} from './DraftQuestionFileBrowserActions.js';
import { DraftQuestionFileBrowserBreadcrumb } from './DraftQuestionFileBrowserBreadcrumb.js';
import { useDraftFiles } from './draftFilesContext.js';
import { useDraftFileNavigation } from './useDraftFileNavigation.js';

function DraftQuestionDirectoryActions({
  data,
  actions,
}: {
  data: DraftQuestionFileBrowserData;
  actions: DraftQuestionFileBrowserActions;
}) {
  const { isGenerating } = useDraftFiles();
  return (
    <div className="d-flex flex-wrap gap-2">
      {data.specialDirs.map((d) => (
        <UploadFileButton
          key={d.label}
          id={`instructorFileUploadForm-New${d.label}`}
          label={`Add new ${d.label.toLowerCase()} file`}
          iconClass="fa fa-plus"
          className="btn btn-sm btn-outline-secondary"
          disabled={isGenerating}
          infoDirectory={d.directory}
          maxFileSizeBytes={data.maxFileSizeBytes}
          target={{ kind: 'new', directory: d.directory }}
          onUploadFile={actions.onUploadFile}
        />
      ))}
      <UploadFileButton
        id="instructorFileUploadForm-New"
        label="Add new file"
        iconClass="fa fa-plus"
        className="btn btn-sm btn-outline-secondary"
        disabled={isGenerating}
        maxFileSizeBytes={data.maxFileSizeBytes}
        target={{ kind: 'new', directory: data.selectedDirectory }}
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
  const { questionId, urlPrefix, isGenerating } = useDraftFiles();
  const { getSelectionUrl } = useDraftFileNavigation();
  const fileUrl = getSelectionUrl({ kind: 'file', path: file.selectedFilePath });
  const { downloadUrl } = getDraftQuestionFileUrls({
    urlPrefix,
    questionId,
    qid: data.qid,
    filePath: file.selectedFilePath,
  });
  const isDisabled = file.disabledReason != null;
  // `question.html` and `server.py` are edited via the dedicated "Files" tab,
  // so the per-file editor / upload / rename / delete don't apply here. The
  // "Edit" link's URL routes to that tab; download is still allowed. The
  // mutations are also disabled while a generation runs, so manual edits can't
  // race the agent's file writes.
  const isManagedByCodeEditorTab = CODE_EDITOR_TAB_FILES.has(file.selectedFilePath);
  const canEdit = file.canEdit && !isDisabled;
  const canUpload = file.canUpload && !isDisabled && !isGenerating && !isManagedByCodeEditorTab;
  const canRename = file.canRename && !isDisabled && !isGenerating && !isManagedByCodeEditorTab;
  const canDelete = file.canDelete && !isDisabled && !isGenerating && !isManagedByCodeEditorTab;

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
            onUploadFile={actions.onUploadFile}
          />
          <FileBrowserActionButton
            icon="fa fa-arrow-down"
            label="Download"
            href={downloadUrl}
            disabled={!file.canDownload}
          />
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
        </div>
      </td>
    </tr>
  );
}

function DraftQuestionDirectoryRow({
  directory,
  onSelectDirectory,
}: {
  directory: DraftQuestionFileBrowserDirectory;
  onSelectDirectory: (directory: string | null) => void;
}) {
  const { getSelectionUrl } = useDraftFileNavigation();
  const directoryUrl = getSelectionUrl({ kind: 'dir', path: directory.selectedDirectory });

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
    <div className="h-100 d-flex flex-column">
      <div className="d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <DraftQuestionFileBrowserBreadcrumb
          selection={{ kind: 'dir', path: data.selectedDirectory }}
          ariaLabel="File browser breadcrumb"
          onSelectDirectory={onSelectDirectory}
        />
        {data.hasEditPermission ? (
          <DraftQuestionDirectoryActions data={data} actions={actions} />
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
                onSelectFile={onSelectFile}
              />
            ))}
            {data.dirs.map((directory) => (
              <DraftQuestionDirectoryRow
                key={`dir-${directory.selectedDirectory}`}
                directory={directory}
                onSelectDirectory={onSelectDirectory}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
