import { QueryClient, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { StaffQuestion } from '../../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../../lib/client/tanstackQuery.js';
import type { QuestionGenerationUIMessage } from '../../../lib/ai-question-generation/agent.js';

import { AiQuestionGenerationChat } from './AiQuestionGenerationChat.js';
import { FinalizeModal } from './FinalizeModal.js';
import {
  type CodeEditorsHandle,
  type NewVariantHandle,
  QuestionAndFilePreview,
} from './QuestionAndFilePreview.js';

async function fetchQuestionFiles(
  urlPrefix: string,
  questionId: string,
): Promise<Record<string, string>> {
  const response = await fetch(`${urlPrefix}/ai_generate_editor/${questionId}/files`, {
    headers: { Accept: 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.files;
}

interface AiQuestionGenerationEditorProps {
  chatCsrfToken: string;
  question: StaffQuestion;
  initialMessages: QuestionGenerationUIMessage[];
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  urlPrefix: string;
  csrfToken: string;
  questionContainerHtml: string;
  showJobLogsLink: boolean;
  variantUrl: string;
  variantCsrfToken: string;
}

function AiQuestionGenerationEditorInner({
  chatCsrfToken,
  question,
  initialMessages,
  questionFiles: initialQuestionFiles,
  richTextEditorEnabled,
  urlPrefix,
  csrfToken,
  questionContainerHtml,
  showJobLogsLink,
  variantUrl,
  variantCsrfToken,
}: AiQuestionGenerationEditorProps) {
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const newVariantRef = useRef<NewVariantHandle>(null);
  const codeEditorsRef = useRef<CodeEditorsHandle>(null);

  const {
    data: questionFiles,
    error: filesError,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: ['question-files', urlPrefix, question.id],
    queryFn: () => fetchQuestionFiles(urlPrefix, question.id),
    staleTime: Infinity,
    initialData: initialQuestionFiles,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  return (
    <div className="app-content">
      <AiQuestionGenerationChat
        chatCsrfToken={chatCsrfToken}
        initialMessages={initialMessages}
        questionId={question.id}
        showJobLogsLink={showJobLogsLink}
        urlPrefix={urlPrefix}
        refreshQuestionPreview={() => newVariantRef.current?.newVariant()}
        hasUnsavedChanges={hasUnsavedChanges}
        discardUnsavedChanges={() => codeEditorsRef.current?.discardChanges()}
        onGeneratingChange={setIsGenerating}
        onGenerationComplete={() => refetchFiles()}
      />

      <div className="d-flex flex-row align-items-stretch bg-light app-preview-tabs z-1">
        <div className="d-flex align-items-center border-bottom ps-2">
          <a
            href={`${urlPrefix}/ai_generate_question_drafts`}
            className="btn btn-sm btn-ghost"
            aria-label="Back to AI questions"
            data-bs-toggle="tooltip"
            data-bs-title="Back to AI questions"
          >
            <i className="fa fa-arrow-left" aria-hidden="true" />
          </a>
        </div>
        <ul className="nav nav-tabs me-auto ps-2 pt-2">
          <li className="nav-item">
            <a
              className="nav-link active"
              data-bs-toggle="tab"
              aria-current="page"
              href="#question-preview"
            >
              Preview
            </a>
          </li>
          <li className="nav-item">
            <a className="nav-link" data-bs-toggle="tab" href="#question-code">
              Files
            </a>
          </li>
          {richTextEditorEnabled ? (
            <li className="nav-item">
              <a className="nav-link" data-bs-toggle="tab" href="#question-rich-text-editor">
                Rich text editor
              </a>
            </li>
          ) : null}
        </ul>
        <div className="d-flex align-items-center justify-content-end flex-grow-1 border-bottom pe-2">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-bs-toggle="tooltip"
            data-bs-title="Finalize a question to use it on assessments and make manual edits"
            disabled={isGenerating}
            onClick={() => setShowFinalizeModal(true)}
          >
            <i className="fa fa-check" aria-hidden="true" />
            Finalize question
          </button>
        </div>
      </div>
      <div className="app-preview">
        <QuestionAndFilePreview
          questionFiles={questionFiles}
          richTextEditorEnabled={richTextEditorEnabled}
          questionContainerHtml={questionContainerHtml}
          csrfToken={csrfToken}
          variantUrl={variantUrl}
          variantCsrfToken={variantCsrfToken}
          newVariantRef={newVariantRef}
          codeEditorsRef={codeEditorsRef}
          isGenerating={isGenerating}
          filesError={filesError}
          onHasUnsavedChanges={setHasUnsavedChanges}
          onRetryFiles={() => refetchFiles()}
        />
      </div>
      <FinalizeModal
        csrfToken={csrfToken}
        show={showFinalizeModal}
        onHide={() => setShowFinalizeModal(false)}
      />
    </div>
  );
}

export function AiQuestionGenerationEditor(props: AiQuestionGenerationEditorProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProviderDebug client={queryClient}>
      <AiQuestionGenerationEditorInner {...props} />
    </QueryClientProviderDebug>
  );
}

AiQuestionGenerationEditor.displayName = 'AiQuestionGenerationEditor';
