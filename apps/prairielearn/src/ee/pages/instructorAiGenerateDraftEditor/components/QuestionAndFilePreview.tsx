import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { executeScripts } from '@prairielearn/browser-utils';

import { NewToPrairieLearnCard } from '../../../../components/NewToPrairieLearnCard.js';
import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { QuestionCodeEditors, type QuestionCodeEditorsHandle } from './QuestionCodeEditors.js';

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

function replaceQuestionContainer(wrapper: HTMLDivElement, htmlResponse: string) {
  // Find and replace the existing .question-container
  const oldQuestionContainer = wrapper.querySelector('.question-container');
  if (!oldQuestionContainer) {
    throw new Error('No existing .question-container found');
  }

  // Create a new container from the HTML response
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResponse, 'text/html');
  const container = doc.querySelector<HTMLElement>('.question-container');

  if (!container) {
    throw new Error('No .question-container found in response');
  }

  // Replace the old container with the new one
  oldQuestionContainer.replaceWith(container);

  executeScripts(container);
}

function copyAttributes(source: Element, target: Element) {
  Array.from(source.attributes).forEach((attr) => {
    target.setAttribute(attr.name, attr.value);
  });
}

function getVariantAssetKey(value: string) {
  if (typeof CSS !== 'undefined' && 'escape' in CSS) {
    return CSS.escape(value);
  }
  // Fallback: escape characters that are special in CSS attribute selectors
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
        `link[rel="stylesheet"][href="${getVariantAssetKey(href)}"]`,
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
        `script[src="${getVariantAssetKey(src)}"]`,
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

function useQuestionHtml({
  variantUrl,
  variantCsrfToken,
}: {
  variantUrl: string;
  variantCsrfToken: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

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

      // TODO: explain this. Needed because a different URL is in use.
      formData.set('__csrf_token', variantCsrfToken);

      // TODO: It's kind of wasteful to render the entire page, including fetching all
      // past AI chat messages, just to get the updated question HTML. We should consider
      // building a special dedicated route for this.

      // Convert FormData to JSON, handling multiple values with the same name as arrays
      const jsonData: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
      for (const [key, value] of formData.entries()) {
        if (key in jsonData) {
          // If key already exists, convert to array or append to array
          const existing = jsonData[key];
          jsonData[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
        } else {
          jsonData[key] = value;
        }
      }

      fetch(variantUrl, {
        method: form.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonData),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Server returned status ${res.status}`);
          if (!wrapperRef.current) return;

          const { questionContainerHtml, extraHeadersHtml } = (await res.json()) as VariantResponse;
          // Inject question-specific assets before executing inline scripts in the new container.
          await syncQuestionAssets(extraHeadersHtml);
          replaceQuestionContainer(wrapperRef.current, questionContainerHtml);

          // TODO: we should update the URL with the new variant ID.
        })
        .catch((err) => {
          console.error('Error submitting question', err);
          // TODO: error handling, prompt the user to refresh the page?
        });
    },
    [variantUrl, variantCsrfToken],
  );

  const newVariant = useCallback(() => {
    fetch(variantUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server returned status ${res.status}`);
        if (!wrapperRef.current) return;

        const { questionContainerHtml, extraHeadersHtml } = (await res.json()) as VariantResponse;
        // Inject question-specific assets before executing inline scripts in the new container.
        await syncQuestionAssets(extraHeadersHtml);
        replaceQuestionContainer(wrapperRef.current, questionContainerHtml);
      })
      .catch((err) => {
        // TODO: better error handling?
        console.error('Error loading new variant', err);
      });
  }, [variantUrl]);

  const handleNewVariantButtonClick = useCallback(
    (e: Event) => {
      if (e.target instanceof HTMLElement && e.target.classList.contains('js-new-variant-button')) {
        e.preventDefault();
        newVariant();
      }
    },
    [newVariant],
  );

  useEffect(() => {
    if (!wrapperRef.current) return;

    const wrapper = wrapperRef.current;
    wrapper.addEventListener('submit', handleSubmit, true);
    wrapper.addEventListener('click', handleNewVariantButtonClick, true);

    return () => {
      wrapper.removeEventListener('submit', handleSubmit, true);
      wrapper.removeEventListener('click', handleNewVariantButtonClick, true);
    };
  }, [wrapperRef, handleSubmit, handleNewVariantButtonClick]);

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

export function QuestionAndFilePreview({
  questionFiles,
  richTextEditorEnabled,
  questionContainerHtml,
  csrfToken,
  variantUrl,
  variantCsrfToken,
  newVariantRef,
  codeEditorsRef,
  isGenerating,
  onHasUnsavedChanges,
  filesError,
  onRetryFiles,
}: {
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  csrfToken: string;
  variantUrl: string;
  variantCsrfToken: string;
  newVariantRef: Ref<NewVariantHandle>;
  codeEditorsRef?: Ref<CodeEditorsHandle>;
  isGenerating: boolean;
  onHasUnsavedChanges?: (hasChanges: boolean) => void;
  filesError?: Error | null;
  onRetryFiles?: () => void;
}) {
  const { wrapperRef, newVariant } = useQuestionHtml({ variantUrl, variantCsrfToken });
  const internalCodeEditorsRef = useRef<QuestionCodeEditorsHandle>(null);

  // Allow the caller to request a new variant.
  useImperativeHandle(newVariantRef, () => ({ newVariant }));

  // Allow the caller to discard code editor changes.
  useImperativeHandle(codeEditorsRef, () => ({
    discardChanges: () => internalCodeEditorsRef.current?.discardChanges(),
  }));

  const isQuestionEmpty = useMemo(
    () => b64DecodeUnicode(questionFiles['question.html'] ?? '').trim() === '',
    [questionFiles],
  );

  return (
    <div className="tab-content" style={{ height: '100%' }}>
      <div
        role="tabpanel"
        id="question-preview"
        className="tab-pane active"
        style={{ height: '100%' }}
      >
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
                    // TODO: Replace with controlled tab state when converting to react-bootstrap tabs.
                    onClick={() => {
                      const tab = document.querySelector<HTMLElement>('a[href="#question-code"]');
                      tab?.click();
                    }}
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
      </div>
      <div role="tabpanel" id="question-code" className="tab-pane" style={{ height: '100%' }}>
        <QuestionCodeEditors
          htmlContents={b64DecodeUnicode(questionFiles['question.html'] || '')}
          pythonContents={b64DecodeUnicode(questionFiles['server.py'] || '')}
          csrfToken={csrfToken}
          isGenerating={isGenerating}
          filesError={filesError}
          editorRef={internalCodeEditorsRef}
          onHasChangesChange={onHasUnsavedChanges}
          onRetryFiles={onRetryFiles}
        />
      </div>
      <div
        role="tabpanel"
        id="question-rich-text-editor"
        className="tab-pane"
        style={{ height: '100%' }}
      >
        {richTextEditorEnabled && (
          <RichTextEditor
            htmlContents={b64DecodeUnicode(questionFiles['question.html'] || '')}
            csrfToken={csrfToken}
            isGenerating={isGenerating}
          />
        )}
      </div>
    </div>
  );
}
