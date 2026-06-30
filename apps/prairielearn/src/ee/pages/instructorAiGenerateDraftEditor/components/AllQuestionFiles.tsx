import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { run } from '@prairielearn/run';

import { type AppError, getAppError, renderAppError } from '../../../../lib/client/errors.js';
import type { DraftQuestionSelectedFile } from '../../../../lib/draft-question-files/browser.js';
import { getDraftQuestionFileUrls } from '../../../../lib/draft-question-files/urls.js';
import type { AiDraftFilesError } from '../../../../trpc/course/ai-draft-files.js';
import { useTRPC } from '../../../../trpc/course/context.js';

import { DraftQuestionFileBrowser } from './DraftQuestionFileBrowser.js';
import { DraftQuestionFileBrowserBreadcrumb } from './DraftQuestionFileBrowserBreadcrumb.js';
import { SelectedQuestionFileEditor } from './SelectedQuestionFileEditor.js';
import { useDraftFiles } from './draftFilesContext.js';
import { useDraftFileNavigation } from './useDraftFileNavigation.js';
import { useDraftQuestionFileMutations } from './useDraftQuestionFileMutations.js';
import { useRefetchDraftFiles } from './useRefetchDraftFiles.js';

function FilesErrorBanner({
  error,
  onRetry,
}: {
  error: AppError<never>;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <div
      className="alert alert-danger mb-0 rounded-0 py-2 d-flex align-items-center justify-content-between"
      role="alert"
    >
      <span>
        <strong>Error loading files:</strong>{' '}
        {renderAppError(error, { UNKNOWN: ({ message }) => message })}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => void onRetry()}
      >
        <i className="fa fa-refresh me-1" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

function FilePreviewContent({
  preview,
  src,
  fileName,
}: {
  preview: Extract<DraftQuestionSelectedFile, { kind: 'preview' }>['preview'];
  src: { imageUrl: string; pdfUrl: string };
  fileName: string;
}) {
  if (preview === 'image') {
    return <img src={src.imageUrl} className="img-fluid" alt={`Preview of ${fileName}`} />;
  }
  if (preview === 'pdf') {
    return (
      <div className="ratio ratio-4x3">
        <iframe src={src.pdfUrl} title={`PDF preview of ${fileName}`}>
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

function SelectedQuestionFilePreviewPanel({
  selectedFile,
  qid,
}: {
  selectedFile: Extract<DraftQuestionSelectedFile, { kind: 'preview' }>;
  qid: string;
}) {
  const { questionId, urlPrefix } = useDraftFiles();
  const { selectDirectory } = useDraftFileNavigation();
  const urls = getDraftQuestionFileUrls({
    urlPrefix,
    questionId,
    qid,
    filePath: selectedFile.path,
  });

  return (
    <div className="selected-file-editor h-100 d-flex flex-column">
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <DraftQuestionFileBrowserBreadcrumb
            selection={{ kind: 'file', path: selectedFile.path }}
            ariaLabel="Selected file breadcrumb"
            onSelectDirectory={(directory) => void selectDirectory(directory)}
          />
          <div className="small text-muted">Preview</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <a className="btn btn-sm btn-outline-secondary" href={urls.fileViewUrl}>
            Open full view
          </a>
          <a className="btn btn-sm btn-outline-secondary" href={urls.downloadUrl}>
            Download
          </a>
        </div>
      </div>
      <div className="flex-grow-1 overflow-auto p-3">
        <FilePreviewContent
          preview={selectedFile.preview}
          src={urls}
          fileName={selectedFile.path.split('/').at(-1) ?? selectedFile.path}
        />
      </div>
    </div>
  );
}

/** The "All files" tab pane: the file browser, or the selected file's editor/preview. */
export function AllQuestionFiles() {
  const { questionId } = useDraftFiles();
  const trpc = useTRPC();
  const { selection, selectFile, selectDirectory } = useDraftFileNavigation();
  const refetchDraftFiles = useRefetchDraftFiles();
  const fileBrowserActions = useDraftQuestionFileMutations();

  const { data: browseData, error: rawBrowseError } = useQuery(
    trpc.aiDraftFiles.browse.queryOptions(
      { questionId, selection },
      {
        staleTime: Infinity,
        // Keep the previously rendered listing interactive while a navigation
        // loads, instead of flashing an empty pane.
        placeholderData: keepPreviousData,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
      },
    ),
  );
  const browseError = getAppError<AiDraftFilesError['Browse']>(rawBrowseError);

  // Surfacing the browse error keeps the previously-rendered selection
  // (placeholder data) interactive while still telling the user the latest
  // navigation failed; replacing the pane would hide the only working view.
  const errorBanner = browseError ? (
    <FilesErrorBanner error={browseError} onRetry={refetchDraftFiles} />
  ) : null;

  const body = run(() => {
    if (browseData == null) {
      return (
        <div className="d-flex align-items-center justify-content-center h-100">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading files...</span>
          </div>
        </div>
      );
    }

    const { fileBrowser, selected } = browseData;

    if (selected?.kind === 'editor') {
      return (
        // Remount when a different file is opened or the file changes on disk, so
        // the editor resets to the saved contents and drops local edits.
        <SelectedQuestionFileEditor
          key={`${selected.path}:${selected.contentHash}`}
          selectedFile={selected}
        />
      );
    }

    if (selected?.kind === 'preview') {
      return <SelectedQuestionFilePreviewPanel selectedFile={selected} qid={fileBrowser.qid} />;
    }

    return (
      <DraftQuestionFileBrowser
        data={fileBrowser}
        actions={fileBrowserActions}
        onSelectFile={selectFile}
        onSelectDirectory={selectDirectory}
      />
    );
  });

  return (
    <div className="h-100 d-flex flex-column">
      {errorBanner}
      <div className="flex-grow-1 min-h-0">{body}</div>
    </div>
  );
}
