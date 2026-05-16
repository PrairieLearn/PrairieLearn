import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Tab } from 'react-bootstrap';

import { executeScripts } from '@prairielearn/browser-utils';

import { NewToPrairieLearnCard } from '../../../../components/NewToPrairieLearnCard.js';
import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import type { SelectedQuestionFile } from '../../../../lib/draft-question-files.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { QuestionCodeEditors, type QuestionCodeEditorsHandle } from './QuestionCodeEditors.js';
import {
  SelectedQuestionFileEditor,
  type SelectedQuestionFileEditorHandle,
} from './SelectedQuestionFileEditor.js';

export interface NewVariantHandle {
  newVariant: () => void;
}

export interface CodeEditorsHandle {
  discardChanges: () => void;
}

interface VariantResponse {
  questionContainerHtml: string;
  extraHeadersHtml: string;
}

function assertOkResponse(response: Response) {
  if (!response.ok) throw new Error(`Server returned status ${response.status}`);
}

function replaceQuestionContainer(wrapper: HTMLDivElement, htmlResponse: string) {
  const oldQuestionContainer = wrapper.querySelector('.question-container');
  if (!oldQuestionContainer) {
    throw new Error('No existing .question-container found');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResponse, 'text/html');
  const container = doc.querySelector<HTMLElement>('.question-container');

  if (!container) {
    throw new Error('No .question-container found in response');
  }

  oldQuestionContainer.replaceWith(container);

  executeScripts(container);
}

function copyAttributes(source: Element, target: Element) {
  Array.from(source.attributes).forEach((attr) => {
    target.setAttribute(attr.name, attr.value);
  });
}

function getCssAttributeSelectorValue(value: string) {
  if (typeof CSS !== 'undefined' && 'escape' in CSS) {
    return CSS.escape(value);
  }
  return value.replaceAll(/["\\[\]]/g, '\\$&');
}

async function syncQuestionAssets(extraHeadersHtml: string): Promise<void> {
  const trimmed = extraHeadersHtml.trim();
  if (!trimmed) return;

  const template = document.createElement('template');
  template.innerHTML = trimmed;

  const loadPromises: Promise<void>[] = [];

  template.content.childNodes.forEach((node) => {
    if (node instanceof HTMLLinkElement) {
      const href = node.getAttribute('href');
      if (!href || node.getAttribute('rel') !== 'stylesheet') return;

      const existing = document.head.querySelector<HTMLLinkElement>(
        `link[rel="stylesheet"][href="${getCssAttributeSelectorValue(href)}"]`,
      );

      if (existing) {
        existing.setAttribute('data-pl-question-asset', 'true');
        return;
      }

      const link = document.createElement('link');
      copyAttributes(node, link);
      link.setAttribute('data-pl-question-asset', 'true');
      document.head.append(link);
      return;
    }

    if (node instanceof HTMLScriptElement) {
      if (node.type === 'importmap') {
        const newText = node.textContent.trim();
        if (!newText) return;

        const existing =
          document.head.querySelector<HTMLScriptElement>(
            'script[type="importmap"][data-pl-question-importmap="true"]',
          ) ?? document.head.querySelector<HTMLScriptElement>('script[type="importmap"]');

        if (existing?.textContent.trim() === newText) {
          existing.setAttribute('data-pl-question-importmap', 'true');
          return;
        }

        const script = document.createElement('script');
        copyAttributes(node, script);
        script.textContent = node.textContent;
        script.setAttribute('data-pl-question-importmap', 'true');

        if (existing) {
          existing.replaceWith(script);
        } else {
          document.head.append(script);
        }
        return;
      }

      const src = node.getAttribute('src');
      if (!src) return;

      const existing = document.head.querySelector<HTMLScriptElement>(
        `script[src="${getCssAttributeSelectorValue(src)}"]`,
      );
      if (existing) {
        existing.setAttribute('data-pl-question-asset', 'true');
        return;
      }

      const script = document.createElement('script');
      copyAttributes(node, script);
      if (!node.hasAttribute('async') && !node.hasAttribute('defer')) {
        script.async = false;
      }
      script.setAttribute('data-pl-question-asset', 'true');
      const loadPromise = new Promise<void>((resolve) => {
        script.addEventListener('load', () => resolve());
        script.addEventListener('error', () => resolve());
      });
      document.head.append(script);
      loadPromises.push(loadPromise);
    }
  });

  if (loadPromises.length > 0) {
    await Promise.all(loadPromises);
  }
}

async function updateQuestionPreview(wrapper: HTMLDivElement, variantResponse: VariantResponse) {
  await syncQuestionAssets(variantResponse.extraHeadersHtml);
  replaceQuestionContainer(wrapper, variantResponse.questionContainerHtml);
}

function formDataToJson(
  formData: FormData,
): Partial<Record<string, FormDataEntryValue | FormDataEntryValue[]>> {
  const jsonData: Partial<Record<string, FormDataEntryValue | FormDataEntryValue[]>> = {};

  for (const [key, value] of formData.entries()) {
    const existing = jsonData[key];
    jsonData[key] =
      existing == null ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return jsonData;
}

function useQuestionHtml({
  variantUrl,
  variantCsrfToken,
}: {
  variantUrl: string;
  variantCsrfToken: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const refreshPreview = useCallback(
    async (init?: RequestInit) => {
      const response = await fetch(variantUrl, init);
      assertOkResponse(response);
      const variantResponse = (await response.json()) as VariantResponse;
      if (wrapperRef.current) {
        await updateQuestionPreview(wrapperRef.current, variantResponse);
      }
    },
    [variantUrl],
  );

  const handleSubmit = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement;

      // Check if the event target is a form with class 'question-form'.
      // This is necessary because we're using event delegation.
      if (!(target instanceof HTMLFormElement) || !target.classList.contains('question-form')) {
        return;
      }

      e.preventDefault();

      const form = target;
      const submitEvent = e as SubmitEvent;
      const formData = new FormData(form);

      // Copy over the submitter button's name/value if present.
      const submitter = submitEvent.submitter;
      if (submitter instanceof HTMLButtonElement && submitter.name && submitter.value) {
        formData.append(submitter.name, submitter.value);
      }

      formData.set('__csrf_token', variantCsrfToken);

      // TODO: It's kind of wasteful to render the entire page, including fetching all
      // past AI chat messages, just to get the updated question HTML. We should consider
      // building a special dedicated route for this.

      refreshPreview({
        method: form.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formDataToJson(formData)),
      })
        .then(() => {
          // TODO: we should update the URL with the new variant ID.
        })
        .catch((err) => {
          console.error('Error submitting question', err);
          // TODO: error handling, prompt the user to refresh the page?
        });
    },
    [refreshPreview, variantCsrfToken],
  );

  const newVariant = useCallback(() => {
    void refreshPreview().catch((err) => {
      // TODO: better error handling?
      console.error('Error loading new variant', err);
    });
  }, [refreshPreview]);

  const handleNewVariantButtonClick = useCallback(
    (e: Event) => {
      if (e.target instanceof HTMLElement && e.target.classList.contains('js-new-variant-button')) {
        e.preventDefault();
        newVariant();
      }
    },
    [newVariant],
  );

  // Attach delegated handlers to question markup rendered outside React.
  useEffect(() => {
    if (!wrapperRef.current) return;

    const wrapper = wrapperRef.current;
    wrapper.addEventListener('submit', handleSubmit, true);
    wrapper.addEventListener('click', handleNewVariantButtonClick, true);

    return () => {
      wrapper.removeEventListener('submit', handleSubmit, true);
      wrapper.removeEventListener('click', handleNewVariantButtonClick, true);
    };
  }, [handleSubmit, handleNewVariantButtonClick]);

  return { wrapperRef, newVariant };
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
  allQuestionFilesHtml,
  selectedFile,
  qid,
  questionId,
  isGenerating,
  onSelectFile,
  onSelectDirectory,
  onClearSelectedFile,
  onSelectedFileSaved,
  onHasChangesChange,
  editorRef,
}: {
  allQuestionFilesHtml: string;
  selectedFile: SelectedQuestionFile | null;
  qid: string | null;
  questionId: string;
  isGenerating: boolean;
  onSelectFile: (filePath: string) => void;
  onSelectDirectory: (directory: string | null) => void;
  onClearSelectedFile: () => void;
  onSelectedFileSaved: () => Promise<unknown>;
  onHasChangesChange: (hasChanges: boolean) => void;
  editorRef?: Ref<SelectedQuestionFileEditorHandle>;
}) {
  const fileListingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedFile == null) onHasChangesChange(false);
  }, [onHasChangesChange, selectedFile]);

  useEffect(() => {
    const fileListing = fileListingRef.current;
    if (!fileListing) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>('a[data-selected-file-path]');
      const filePath = link?.dataset.selectedFilePath;
      if (filePath != null) {
        event.preventDefault();
        onSelectFile(filePath);
        return;
      }

      const directoryLink = target.closest<HTMLAnchorElement>('a[data-selected-directory-path]');
      const directoryPath = directoryLink?.dataset.selectedDirectoryPath;
      if (directoryPath == null) return;

      event.preventDefault();
      onSelectDirectory(directoryPath === '' ? null : directoryPath);
    };

    fileListing.addEventListener('click', handleClick);

    return () => {
      fileListing.removeEventListener('click', handleClick);
    };
  }, [onSelectDirectory, onSelectFile]);

  if (!qid) return null;

  if (selectedFile != null) {
    return (
      <SelectedQuestionFileEditor
        key={`${selectedFile.path}:${selectedFile.encodedContents}`}
        selectedFile={selectedFile}
        questionId={questionId}
        isGenerating={isGenerating}
        editorRef={editorRef}
        onShowAllFiles={onClearSelectedFile}
        onSaved={onSelectedFileSaved}
        onHasChangesChange={onHasChangesChange}
      />
    );
  }

  return (
    <div className="p-3">
      <div
        ref={fileListingRef}
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{ __html: allQuestionFilesHtml }}
      />
    </div>
  );
}

export function QuestionAndFilePreview({
  questionFiles,
  allQuestionFilesHtml,
  selectedFile,
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
  onHasUnsavedChanges,
  filesError,
  onRetryFiles,
  onSelectTab,
  onSelectFile,
  onSelectDirectory,
  onClearSelectedFile,
  onSelectedFileSaved,
}: {
  questionFiles: Record<string, string>;
  allQuestionFilesHtml: string;
  selectedFile: SelectedQuestionFile | null;
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
  onHasUnsavedChanges?: (hasChanges: boolean) => void;
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
  const [codeEditorsHaveChanges, setCodeEditorsHaveChanges] = useState(false);
  const [selectedFileHasChanges, setSelectedFileHasChanges] = useState(false);

  // Allow the caller to request a new variant.
  useImperativeHandle(newVariantRef, () => ({ newVariant }));

  // Allow the caller to discard code editor changes.
  useImperativeHandle(codeEditorsRef, () => ({
    discardChanges: () => {
      internalCodeEditorsRef.current?.discardChanges();
      selectedFileEditorRef.current?.discardChanges();
    },
  }));

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    onHasUnsavedChanges?.(codeEditorsHaveChanges || selectedFileHasChanges);
  }, [codeEditorsHaveChanges, onHasUnsavedChanges, selectedFileHasChanges]);

  const isQuestionEmpty = useMemo(
    () => b64DecodeUnicode(questionFiles['question.html'] ?? '').trim() === '',
    [questionFiles],
  );

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
          onHasChangesChange={setCodeEditorsHaveChanges}
          onRetryFiles={onRetryFiles}
        />
      </Tab.Pane>
      <Tab.Pane eventKey="all-files" className="h-100">
        <AllQuestionFiles
          allQuestionFilesHtml={allQuestionFilesHtml}
          selectedFile={selectedFile}
          qid={qid}
          questionId={questionId}
          isGenerating={isGenerating}
          editorRef={selectedFileEditorRef}
          onSelectFile={onSelectFile}
          onSelectDirectory={onSelectDirectory}
          onClearSelectedFile={onClearSelectedFile}
          onSelectedFileSaved={onSelectedFileSaved}
          onHasChangesChange={setSelectedFileHasChanges}
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
