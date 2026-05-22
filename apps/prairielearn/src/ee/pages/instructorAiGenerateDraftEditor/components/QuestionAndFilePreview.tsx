import { type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import { Tab } from 'react-bootstrap';

import { executeScripts } from '@prairielearn/browser-utils';

import { DraftQuestionFileBrowser } from '../../../../components/DraftQuestionFileBrowser.js';
import type { DraftQuestionFileBrowserActions } from '../../../../components/DraftQuestionFileBrowserActions.js';
import { NewToPrairieLearnCard } from '../../../../components/NewToPrairieLearnCard.js';
import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import type {
  DraftQuestionFileBrowserData,
  SelectedQuestionFile,
  SelectedQuestionFilePreview,
} from '../../../../lib/draft-question-files/browser.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { QuestionCodeEditors, type QuestionCodeEditorsHandle } from './QuestionCodeEditors.js';
import {
  SelectedQuestionFileBreadcrumb,
  SelectedQuestionFileEditor,
  type SelectedQuestionFileEditorHandle,
} from './SelectedQuestionFileEditor.js';
import { useQuestionHtml } from './useQuestionHtml.js';

export interface NewVariantHandle {
  newVariant: () => void;
}

export interface CodeEditorsHandle {
  discardChanges: () => void;
  /** Returns whether either the code editors or the selected file editor hold unsaved changes. */
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
  fileBrowser,
  fileBrowserActions,
  selectedFile,
  selectedFilePreview,
  allFilesHref,
  search,
  urlPrefix,
  qid,
  questionId,
  isGenerating,
  onSelectFile,
  onSelectDirectory,
  onClearSelectedFile,
  onSelectedFileSaved,
  editorRef,
}: {
  fileBrowser: DraftQuestionFileBrowserData;
  fileBrowserActions: DraftQuestionFileBrowserActions;
  selectedFile: SelectedQuestionFile | null;
  selectedFilePreview: SelectedQuestionFilePreview | null;
  allFilesHref: string;
  search: string;
  urlPrefix: string;
  qid: string | null;
  questionId: string;
  isGenerating: boolean;
  onSelectFile: (filePath: string) => void;
  onSelectDirectory: (directory: string | null) => void;
  onClearSelectedFile: () => void;
  onSelectedFileSaved: () => Promise<unknown>;
  editorRef?: Ref<SelectedQuestionFileEditorHandle>;
}) {
  if (!qid) return null;

  if (selectedFile != null) {
    return (
      <SelectedQuestionFileEditor
        key={`${selectedFile.path}:${selectedFile.contentHash}`}
        selectedFile={selectedFile}
        questionId={questionId}
        isGenerating={isGenerating}
        allFilesHref={allFilesHref}
        urlPrefix={urlPrefix}
        editorRef={editorRef}
        onShowAllFiles={onClearSelectedFile}
        onSaved={onSelectedFileSaved}
      />
    );
  }

  if (selectedFilePreview != null) {
    return (
      <SelectedQuestionFilePreviewPanel
        selectedFilePreview={selectedFilePreview}
        allFilesHref={allFilesHref}
        onShowAllFiles={onClearSelectedFile}
      />
    );
  }

  return (
    <div className="p-3">
      <DraftQuestionFileBrowser
        data={fileBrowser}
        actions={fileBrowserActions}
        search={search}
        onSelectFile={onSelectFile}
        onSelectDirectory={onSelectDirectory}
      />
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
  allFilesHref,
  onShowAllFiles,
}: {
  selectedFilePreview: SelectedQuestionFilePreview;
  allFilesHref: string;
  onShowAllFiles: () => void;
}) {
  return (
    <div className="selected-file-editor h-100 d-flex flex-column">
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <SelectedQuestionFileBreadcrumb
            filePath={selectedFilePreview.path}
            allFilesHref={allFilesHref}
            onShowAllFiles={onShowAllFiles}
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
  questionFiles,
  fileBrowser,
  fileBrowserActions,
  selectedFile,
  selectedFilePreview,
  allFilesHref,
  search,
  urlPrefix,
  richTextEditorEnabled,
  questionContainerHtml,
  csrfToken,
  questionId,
  qid,
  variantUrl,
  variantCsrfToken,
  newVariantRef,
  codeEditorsRef,
  isGenerating,
  isQuestionEmpty,
  filesError,
  onRetryFiles,
  onSelectTab,
  onSelectFile,
  onSelectDirectory,
  onClearSelectedFile,
  onSelectedFileSaved,
}: {
  questionFiles: Record<string, string>;
  fileBrowser: DraftQuestionFileBrowserData;
  fileBrowserActions: DraftQuestionFileBrowserActions;
  selectedFile: SelectedQuestionFile | null;
  selectedFilePreview: SelectedQuestionFilePreview | null;
  allFilesHref: string;
  search: string;
  urlPrefix: string;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  csrfToken: string;
  questionId: string;
  qid: string | null;
  variantUrl: string;
  variantCsrfToken: string;
  newVariantRef: Ref<NewVariantHandle>;
  codeEditorsRef?: Ref<CodeEditorsHandle>;
  isGenerating: boolean;
  isQuestionEmpty: boolean;
  filesError?: { message: string } | null;
  onRetryFiles?: () => void;
  onSelectTab: (tab: 'files') => void;
  onSelectFile: (filePath: string) => void;
  onSelectDirectory: (directory: string | null) => void;
  onClearSelectedFile: () => void;
  onSelectedFileSaved: () => Promise<unknown>;
}) {
  const { wrapperRef, newVariant } = useQuestionHtml({ variantUrl, variantCsrfToken });
  const internalCodeEditorsRef = useRef<QuestionCodeEditorsHandle>(null);
  const selectedFileEditorRef = useRef<SelectedQuestionFileEditorHandle>(null);

  // Allow the caller to request a new variant.
  useImperativeHandle(newVariantRef, () => ({ newVariant }));

  // Allow the caller to discard code editor changes and query for unsaved changes.
  useImperativeHandle(codeEditorsRef, () => ({
    discardChanges: () => {
      internalCodeEditorsRef.current?.discardChanges();
      selectedFileEditorRef.current?.discardChanges();
    },
    getHasUnsavedChanges: () =>
      (internalCodeEditorsRef.current?.getHasChanges() ?? false) ||
      (selectedFileEditorRef.current?.getHasChanges() ?? false),
  }));

  return (
    <Tab.Content className="h-100">
      <Tab.Pane eventKey="preview" className="h-100">
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
          htmlContents={b64DecodeUnicode(questionFiles['question.html'] || '')}
          pythonContents={b64DecodeUnicode(questionFiles['server.py'] || '')}
          csrfToken={csrfToken}
          isGenerating={isGenerating}
          filesError={filesError}
          editorRef={internalCodeEditorsRef}
          onRetryFiles={onRetryFiles}
        />
      </Tab.Pane>
      <Tab.Pane eventKey="all-files" className="h-100">
        <AllQuestionFiles
          fileBrowser={fileBrowser}
          fileBrowserActions={fileBrowserActions}
          selectedFile={selectedFile}
          selectedFilePreview={selectedFilePreview}
          allFilesHref={allFilesHref}
          search={search}
          urlPrefix={urlPrefix}
          qid={qid}
          questionId={questionId}
          isGenerating={isGenerating}
          editorRef={selectedFileEditorRef}
          onSelectFile={onSelectFile}
          onSelectDirectory={onSelectDirectory}
          onClearSelectedFile={onClearSelectedFile}
          onSelectedFileSaved={onSelectedFileSaved}
        />
      </Tab.Pane>
      <Tab.Pane eventKey="rich-text-editor" className="h-100">
        {richTextEditorEnabled && (
          <RichTextEditor
            htmlContents={b64DecodeUnicode(questionFiles['question.html'] || '')}
            csrfToken={csrfToken}
            isGenerating={isGenerating}
          />
        )}
      </Tab.Pane>
    </Tab.Content>
  );
}
