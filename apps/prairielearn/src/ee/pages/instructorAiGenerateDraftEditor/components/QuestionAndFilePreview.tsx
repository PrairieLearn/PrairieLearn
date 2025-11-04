import type { Ref } from 'preact';
import { useEffect, useImperativeHandle, useRef } from 'preact/hooks';

import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { QuestionCodeEditors } from './QuestionCodeEditors.js';

export interface NewVariantHandle {
  newVariant: () => void;
}

function useQuestionHtml() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  function handleSubmit(e: Event) {
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

    // TODO: It's kind of wasteful to render the entire page, including fetching all
    // past AI chat messages, just to get the updated question HTML. We should consider
    // building a special dedicated route for this.
    fetch(form.action, {
      method: form.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server returned status ${res.status}`);

        const text = await res.text();

        // Parse the HTML response to extract the .question-container
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const newQuestionContainer = doc.querySelector('.question-container');

        if (!newQuestionContainer) {
          throw new Error('No .question-container found in response');
        }

        // Find and replace the existing .question-container
        const oldQuestionContainer = wrapperRef.current?.querySelector('.question-container');
        if (!oldQuestionContainer) {
          throw new Error('No existing .question-container found');
        }

        // Replace the old container with the new one
        oldQuestionContainer.replaceWith(newQuestionContainer);

        // Execute any scripts in the new container
        const scripts = newQuestionContainer.querySelectorAll('script');
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

        // TODO: we should update the URL with the new variant ID.
      })
      .catch((err) => {
        console.error('Error submitting question', err);
        // TODO: error handling, prompt the user to refresh the page?
      });
  }

  useEffect(() => {
    if (!wrapperRef.current) return;

    const wrapper = wrapperRef.current;
    wrapper.addEventListener('submit', handleSubmit, true);

    return () => {
      wrapper.removeEventListener('submit', handleSubmit, true);
    };
  }, [wrapperRef]);

  const newVariant = () => {
    console.log('new variant requested');
  };

  return { wrapperRef, newVariant };
}

export function QuestionAndFilePreview({
  questionFiles,
  richTextEditorEnabled,
  questionContainerHtml,
  csrfToken,
  newVariantRef,
}: {
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  csrfToken: string;
  newVariantRef: Ref<NewVariantHandle>;
}) {
  const { wrapperRef, newVariant } = useQuestionHtml();

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
