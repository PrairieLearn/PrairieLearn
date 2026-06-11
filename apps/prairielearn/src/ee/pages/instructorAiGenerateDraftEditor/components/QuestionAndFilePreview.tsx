import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type Ref, useEffect, useRef } from 'react';
import { Alert, Tab } from 'react-bootstrap';

import { executeScripts } from '@prairielearn/browser-utils';
import { run } from '@prairielearn/run';

import { NewToPrairieLearnCard } from '../../../../components/NewToPrairieLearnCard.js';
import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import { type AppError, getAppError, renderAppError } from '../../../../lib/client/errors.js';
import type {
  DraftQuestionFileContent,
  DraftQuestionSelectedFile,
} from '../../../../lib/draft-question-files/browser.js';
import { getDraftQuestionFileUrls } from '../../../../lib/draft-question-files/urls.js';
import type { AiDraftFilesError } from '../../../../trpc/course/ai-draft-files.js';
import { useTRPC } from '../../../../trpc/course/context.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { DraftQuestionFileBrowser } from './DraftQuestionFileBrowser.js';
import { DraftQuestionFileBrowserBreadcrumb } from './DraftQuestionFileBrowserBreadcrumb.js';
import { QuestionCodeEditors } from './QuestionCodeEditors.js';
import { SelectedQuestionFileEditor } from './SelectedQuestionFileEditor.js';
import { useDraftFiles } from './draftFilesContext.js';
import { useDraftFileNavigation } from './useDraftFileNavigation.js';
import { useDraftQuestionFileMutations } from './useDraftQuestionFileMutations.js';
import type { QuestionPreviewError } from './useQuestionHtml.js';
import { useRefetchDraftFiles } from './useRefetchDraftFiles.js';

function QuestionPreview({ questionContainerHtml }: { questionContainerHtml: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // We use this approach instead of `dangerouslySetInnerHTML` to avoid a hydration error
  // if a question uses scripts that change its own HTML after loading.
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = questionContainerHtml;
    const container = ref.current.querySelector<HTMLElement>('.question-container') ?? ref.current;
    executeScripts(container);
  }, [questionContainerHtml]);

  return <div ref={ref} suppressHydrationWarning />;
}

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

function AllQuestionFiles({ onFileMutated }: { onFileMutated: () => Promise<unknown> }) {
  const { questionId } = useDraftFiles();
  const trpc = useTRPC();
  const { selection, selectFile, selectDirectory } = useDraftFileNavigation();
  const refetchDraftFiles = useRefetchDraftFiles();
  const fileBrowserActions = useDraftQuestionFileMutations({ onMutated: onFileMutated });

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
          onFileMutated={onFileMutated}
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

export function QuestionAndFilePreview({
  files,
  richTextEditorEnabled,
  questionContainerHtml,
  csrfToken,
  previewWrapperRef,
  previewError,
  onDismissPreviewError,
  onFileMutated,
  isQuestionEmpty,
  contentsError,
  onSelectTab,
}: {
  /** File contents keyed by question-relative path. */
  files: Partial<Record<string, DraftQuestionFileContent>>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  csrfToken: string;
  /** Wrapper element `useQuestionHtml` swaps the question preview into. */
  previewWrapperRef: Ref<HTMLDivElement>;
  previewError: QuestionPreviewError | null;
  onDismissPreviewError: () => void;
  onFileMutated: () => Promise<unknown>;
  isQuestionEmpty: boolean;
  contentsError: AppError<AiDraftFilesError['Contents']> | null;
  onSelectTab: (tab: 'files') => void;
}) {
  const { isGenerating } = useDraftFiles();
  const htmlFile = files['question.html'] ?? null;
  const htmlContents = htmlFile ? b64DecodeUnicode(htmlFile.encodedContents) : '';

  return (
    <Tab.Content className="h-100">
      <Tab.Pane eventKey="preview" className="h-100">
        {previewError && (
          <Alert variant="danger" className="m-3 mb-0" dismissible onClose={onDismissPreviewError}>
            <span className="me-2">{previewError.message}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={previewError.retry}
            >
              <i className="fa fa-refresh me-1" aria-hidden="true" />
              Retry
            </button>
          </Alert>
        )}
        {isQuestionEmpty && (
          <div className="d-flex align-items-center justify-content-center h-100">
            {isGenerating ? (
              <div className="text-center px-4">
                <div
                  className="spinner-border text-primary mb-2"
                  role="status"
                  style={{ width: '2rem', height: '2rem' }}
                >
                  <span className="visually-hidden">Generating...</span>
                </div>
                <p className="text-muted mb-0">Creating your question...</p>
              </div>
            ) : (
              <div className="text-center px-4" style={{ maxWidth: '26rem' }}>
                <h3 className="h5 mb-2">Create a question</h3>
                <p className="text-muted mb-3" style={{ textWrap: 'balance' }}>
                  You can write code in the{' '}
                  <button
                    type="button"
                    className="btn btn-link p-0 align-baseline fw-bold"
                    onClick={() => onSelectTab('files')}
                  >
                    Files
                  </button>{' '}
                  tab, or use the chat to create a question with AI.
                </p>
                <div className="mt-4">
                  <NewToPrairieLearnCard />
                </div>
              </div>
            )}
          </div>
        )}
        <div
          ref={previewWrapperRef}
          className="question-wrapper mx-auto p-3"
          style={isQuestionEmpty ? { display: 'none' } : undefined}
        >
          <QuestionPreview questionContainerHtml={questionContainerHtml} />
        </div>
      </Tab.Pane>
      <Tab.Pane eventKey="files" className="h-100">
        <QuestionCodeEditors
          htmlFile={htmlFile}
          pythonFile={files['server.py'] ?? null}
          filesError={contentsError}
          onFileMutated={onFileMutated}
        />
      </Tab.Pane>
      <Tab.Pane eventKey="all-files" className="h-100">
        <AllQuestionFiles onFileMutated={onFileMutated} />
      </Tab.Pane>
      <Tab.Pane eventKey="rich-text-editor" className="h-100">
        {richTextEditorEnabled && (
          <RichTextEditor
            htmlContents={htmlContents}
            csrfToken={csrfToken}
            isGenerating={isGenerating}
          />
        )}
      </Tab.Pane>
    </Tab.Content>
  );
}
