import { type Ref, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Alert, Tab } from 'react-bootstrap';

import { executeScripts } from '@prairielearn/browser-utils';
import { run } from '@prairielearn/run';

import { DraftQuestionFileBrowser } from '../../../../components/DraftQuestionFileBrowser.js';
import { DraftQuestionFileBrowserBreadcrumb } from '../../../../components/DraftQuestionFileBrowserBreadcrumb.js';
import { NewToPrairieLearnCard } from '../../../../components/NewToPrairieLearnCard.js';
import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import { type AppError, renderAppError } from '../../../../lib/client/errors.js';
import type {
  DraftQuestionFileBrowserBreadcrumbSegment,
  QuestionFilesData,
  SelectedQuestionFilePreview,
} from '../../../../lib/draft-question-files/browser.js';
import type { AiDraftFilesError } from '../../../../trpc/shared/ai-draft-files.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { QuestionCodeEditors, type QuestionCodeEditorsHandle } from './QuestionCodeEditors.js';
import {
  SelectedQuestionFileEditor,
  type SelectedQuestionFileEditorHandle,
} from './SelectedQuestionFileEditor.js';
import { useRefetchDraftFiles } from './aiDraftFilesTrpc.js';
import { useDraftFiles } from './draftFilesContext.js';
import { useDraftFileNavigation } from './useDraftFileNavigation.js';
import { useDraftQuestionFileMutations } from './useDraftQuestionFileMutations.js';
import { useQuestionHtml } from './useQuestionHtml.js';

export interface NewVariantHandle {
  newVariant: () => void;
}

/**
 * Aggregates the unsaved-changes state of both file editors — the question code
 * editors and the selected-file editor — so the parent can guard navigation.
 */
export interface UnsavedChangesHandle {
  discardChanges: () => void;
  /** Whether either editor currently holds unsaved changes. */
  getHasUnsavedChanges: () => boolean;
}

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

function AllQuestionFiles({
  questionFilesData,
  qid,
  filesError,
  onFileMutated,
  editorRef,
}: {
  questionFilesData: QuestionFilesData;
  qid: string | null;
  filesError: AppError<AiDraftFilesError['List']> | null;
  onFileMutated: () => Promise<unknown>;
  editorRef?: Ref<SelectedQuestionFileEditorHandle>;
}) {
  const { questionId, urlPrefix, uploadCsrfToken, search, isGenerating } = useDraftFiles();
  const { selectFile, selectDirectory } = useDraftFileNavigation();
  const refetchDraftFiles = useRefetchDraftFiles();
  const { fileBrowser, selectedFile, selectedFilePreview, breadcrumb } = questionFilesData;
  const fileBrowserActions = useDraftQuestionFileMutations({
    questionId,
    urlPrefix,
    uploadCsrfToken,
    onMutated: onFileMutated,
  });

  if (!qid) return null;

  // Surfacing the list-query error keeps the previously-rendered selection
  // (placeholder data) interactive while still telling the user the latest
  // navigation failed; replacing the pane would hide the only working view.
  const errorBanner = filesError ? (
    <div
      className="alert alert-danger mb-0 rounded-0 py-2 d-flex align-items-center justify-content-between"
      role="alert"
    >
      <span>
        <strong>Error loading files:</strong>{' '}
        {renderAppError(filesError, { UNKNOWN: ({ message }) => message })}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => void refetchDraftFiles()}
      >
        <i className="fa fa-refresh me-1" aria-hidden="true" />
        Retry
      </button>
    </div>
  ) : null;

  const body = run(() => {
    if (selectedFile != null) {
      return (
        // Remount when a different file is opened or the file changes on disk, so
        // the editor resets to the saved contents and drops local edits.
        <SelectedQuestionFileEditor
          key={`${selectedFile.path}:${selectedFile.contentHash}`}
          selectedFile={selectedFile}
          breadcrumb={breadcrumb}
          editorUrl={fileBrowser.editorUrl}
          editorRef={editorRef}
          onFileMutated={onFileMutated}
        />
      );
    }

    if (selectedFilePreview != null) {
      return (
        <SelectedQuestionFilePreviewPanel
          selectedFilePreview={selectedFilePreview}
          breadcrumb={breadcrumb}
          editorUrl={fileBrowser.editorUrl}
        />
      );
    }

    return (
      <DraftQuestionFileBrowser
        data={fileBrowser}
        breadcrumb={breadcrumb}
        actions={fileBrowserActions}
        search={search}
        // Don't let manual file edits race the agent's file writes.
        disableActions={isGenerating}
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
  content,
  fileName,
}: {
  content: SelectedQuestionFilePreview['content'];
  fileName: string;
}) {
  if (content.kind === 'image') {
    return <img src={content.src} className="img-fluid" alt={`Preview of ${fileName}`} />;
  }
  if (content.kind === 'pdf') {
    return (
      <div className="ratio ratio-4x3">
        <iframe src={content.src} title={`PDF preview of ${fileName}`}>
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
  selectedFilePreview,
  breadcrumb,
  editorUrl,
}: {
  selectedFilePreview: SelectedQuestionFilePreview;
  breadcrumb: DraftQuestionFileBrowserBreadcrumbSegment[];
  editorUrl: string;
}) {
  const { search } = useDraftFiles();
  const { selectDirectory } = useDraftFileNavigation();

  return (
    <div className="selected-file-editor h-100 d-flex flex-column">
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <DraftQuestionFileBrowserBreadcrumb
            segments={breadcrumb}
            editorUrl={editorUrl}
            search={search}
            ariaLabel="Selected file breadcrumb"
            onSelectDirectory={(directory) => void selectDirectory(directory)}
          />
          <div className="small text-muted">Preview</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <a className="btn btn-sm btn-outline-secondary" href={selectedFilePreview.fileViewUrl}>
            Open full view
          </a>
          <a className="btn btn-sm btn-outline-secondary" href={selectedFilePreview.downloadUrl}>
            Download
          </a>
        </div>
      </div>
      <div className="flex-grow-1 overflow-auto p-3">
        <FilePreviewContent
          content={selectedFilePreview.content}
          fileName={selectedFilePreview.path.split('/').at(-1) ?? selectedFilePreview.path}
        />
      </div>
    </div>
  );
}

export function QuestionAndFilePreview({
  questionFilesData,
  richTextEditorEnabled,
  questionContainerHtml,
  csrfToken,
  qid,
  variantUrl,
  variantCsrfToken,
  newVariantRef,
  unsavedChangesRef,
  isQuestionEmpty,
  filesError,
  onSelectTab,
}: {
  questionFilesData: QuestionFilesData;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  csrfToken: string;
  qid: string | null;
  variantUrl: string;
  variantCsrfToken: string;
  newVariantRef: Ref<NewVariantHandle>;
  unsavedChangesRef?: Ref<UnsavedChangesHandle>;
  isQuestionEmpty: boolean;
  filesError: AppError<AiDraftFilesError['List']> | null;
  onSelectTab: (tab: 'files') => void;
}) {
  const { isGenerating } = useDraftFiles();
  const refetchDraftFiles = useRefetchDraftFiles();
  const { wrapperRef, newVariant, previewError, dismissPreviewError } = useQuestionHtml({
    variantUrl,
    variantCsrfToken,
  });
  const internalCodeEditorsRef = useRef<QuestionCodeEditorsHandle>(null);
  const selectedFileEditorRef = useRef<SelectedQuestionFileEditorHandle>(null);
  const htmlContents = b64DecodeUnicode(questionFilesData.files['question.html'] || '');

  // Allow the caller to request a new variant.
  useImperativeHandle(newVariantRef, () => ({ newVariant }));

  // Allow the caller to discard editor changes and query for unsaved changes
  // across both the code editors and the selected-file editor.
  useImperativeHandle(unsavedChangesRef, () => ({
    discardChanges: () => {
      internalCodeEditorsRef.current?.discardChanges();
      selectedFileEditorRef.current?.discardChanges();
    },
    getHasUnsavedChanges: () =>
      (internalCodeEditorsRef.current?.getHasChanges() ?? false) ||
      (selectedFileEditorRef.current?.getHasChanges() ?? false),
  }));

  // After a file mutation: refresh the file data, then reload the preview.
  const handleFileMutated = useCallback(async () => {
    await refetchDraftFiles();
    newVariant();
  }, [refetchDraftFiles, newVariant]);

  return (
    <Tab.Content className="h-100">
      <Tab.Pane eventKey="preview" className="h-100">
        {previewError && (
          <Alert variant="danger" className="m-3 mb-0" dismissible onClose={dismissPreviewError}>
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
          ref={wrapperRef}
          className="question-wrapper mx-auto p-3"
          style={isQuestionEmpty ? { display: 'none' } : undefined}
        >
          <QuestionPreview questionContainerHtml={questionContainerHtml} />
        </div>
      </Tab.Pane>
      <Tab.Pane eventKey="files" className="h-100">
        <QuestionCodeEditors
          htmlContents={htmlContents}
          pythonContents={b64DecodeUnicode(questionFilesData.files['server.py'] || '')}
          filesError={filesError}
          editorRef={internalCodeEditorsRef}
          onFileMutated={handleFileMutated}
        />
      </Tab.Pane>
      <Tab.Pane eventKey="all-files" className="h-100">
        <AllQuestionFiles
          questionFilesData={questionFilesData}
          qid={qid}
          filesError={filesError}
          editorRef={selectedFileEditorRef}
          onFileMutated={handleFileMutated}
        />
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
