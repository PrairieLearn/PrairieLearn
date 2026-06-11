import { useQueryState } from 'nuqs';
import { type Ref, useEffect, useRef } from 'react';
import { Alert } from 'react-bootstrap';

import { executeScripts } from '@prairielearn/browser-utils';

import { NewToPrairieLearnCard } from '../../../../components/NewToPrairieLearnCard.js';

import { useDraftFiles } from './draftFilesContext.js';
import { tabParser } from './useDraftFileNavigation.js';
import type { QuestionPreviewError } from './useQuestionHtml.js';

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

/** The "Preview" tab pane: the rendered question, or an empty-question state. */
export function QuestionPreviewPane({
  questionContainerHtml,
  previewWrapperRef,
  previewError,
  onDismissPreviewError,
  isQuestionEmpty,
}: {
  questionContainerHtml: string;
  /** Wrapper element `useQuestionHtml` swaps the question preview into. */
  previewWrapperRef: Ref<HTMLDivElement>;
  previewError: QuestionPreviewError | null;
  onDismissPreviewError: () => void;
  isQuestionEmpty: boolean;
}) {
  const { isGenerating } = useDraftFiles();
  const [, setActiveTab] = useQueryState('tab', tabParser);

  return (
    <>
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
                  onClick={() => void setActiveTab('files')}
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
    </>
  );
}
