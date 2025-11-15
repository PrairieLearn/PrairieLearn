import type { Ref } from 'preact';
import { useCallback, useEffect, useImperativeHandle, useRef } from 'preact/hooks';

import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { QuestionCodeEditors } from './QuestionCodeEditors.js';

export interface NewVariantHandle {
  newVariant: () => void;
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

  // Execute any scripts in the new container
  const scripts = container.querySelectorAll('script');
  scripts.forEach((oldScript) => {
    const newScript = document.createElement('script');

    // Copy all attributes
    Array.from(oldScript.attributes).forEach((attr) => {
      newScript.setAttribute(attr.name, attr.value);
    });

    // Copy script content
    newScript.textContent = oldScript.textContent;

    // Replace the old script with the new one to trigger execution
    oldScript.replaceWith(newScript);
  });
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
      fetch(variantUrl, {
        method: form.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Server returned status ${res.status}`);

          replaceQuestionContainer(wrapperRef.current!, await res.text());

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

        replaceQuestionContainer(wrapperRef.current!, await res.text());
      })
      .catch((err) => {
        // TODO: better error handling?
        console.error('Error loading new variant', err);
      });
  }, [variantUrl]);

  const handleNewVariantButtonClick = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('js-new-variant-button')) {
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

export function QuestionAndFilePreview({
  questionFiles,
  richTextEditorEnabled,
  questionContainerHtml,
  csrfToken,
  variantUrl,
  variantCsrfToken,
  newVariantRef,
}: {
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  csrfToken: string;
  variantUrl: string;
  variantCsrfToken: string;
  newVariantRef: Ref<NewVariantHandle>;
}) {
  const { wrapperRef, newVariant } = useQuestionHtml({ variantUrl, variantCsrfToken });

  // Allow the caller to request a new variant.
  useImperativeHandle(newVariantRef, () => ({ newVariant }));

  return (
    <div class="tab-content" style="height: 100%">
      <div role="tabpanel" id="question-preview" class="tab-pane active" style="height: 100%">
        <div
          ref={wrapperRef}
          class="question-wrapper mx-auto p-3"
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{ __html: questionContainerHtml }}
        />
      </div>
      <div role="tabpanel" id="question-code" class="tab-pane" style="height: 100%">
        <QuestionCodeEditors
          htmlContents={b64DecodeUnicode(questionFiles['question.html'] || '')}
          pythonContents={b64DecodeUnicode(questionFiles['server.py'] || '')}
          csrfToken={csrfToken}
        />
      </div>
      <div role="tabpanel" id="question-rich-text-editor" class="tab-pane" style="height: 100%">
        {richTextEditorEnabled && (
          <RichTextEditor
            htmlContents={b64DecodeUnicode(questionFiles['question.html'] || '')}
            csrfToken={csrfToken}
          />
        )}
      </div>
    </div>
  );
}
