import { QueryClient, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { run } from '@prairielearn/run';

import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
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
import { DRAFT_QID_PREFIX, QuestionTitleAndQid } from './QuestionTitleAndQid.js';

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
  const [currentTitle, setCurrentTitle] = useState(question.title);
  const [currentQid, setCurrentQid] = useState(question.qid);
  const newVariantRef = useRef<NewVariantHandle>(null);
  const codeEditorsRef = useRef<CodeEditorsHandle>(null);

  const handleTitleAndQidSaved = useCallback(
    (update: { qid: string | null; title: string | null }) => {
      setCurrentQid(update.qid);
      setCurrentTitle(update.title);
    },
    [],
  );

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

  const isQuestionEmpty = useMemo(
    () => b64DecodeUnicode(questionFiles['question.html'] ?? '').trim() === '',
    [questionFiles],
  );

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
        isQuestionEmpty={isQuestionEmpty}
        onGeneratingChange={setIsGenerating}
        onGenerationComplete={() => refetchFiles()}
      />

      <div className="app-preview-tabs z-1">
        <QuestionTitleAndQid
          currentQid={currentQid}
          currentTitle={currentTitle}
          csrfToken={csrfToken}
          onSaved={handleTitleAndQidSaved}
        />
        <div className="d-flex flex-row align-items-stretch bg-light">
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
            {!isQuestionEmpty && (
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
            )}
          </div>
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
        // Key on the current values so the uncontrolled inputs reset when the
        // user edits the title/QID inline and reopens the modal.
        key={`${currentTitle ?? ''}::${currentQid ?? ''}`}
        csrfToken={csrfToken}
        show={showFinalizeModal}
        // Don't pre-fill auto-generated placeholder values like "draft #3" or
        // "draft_3" — these are system defaults that users almost certainly
        // want to replace when finalizing, so showing them would just force
        // the user to clear the field before typing a real value.
        defaultTitle={
          currentTitle && !/^draft #\d+$/i.test(currentTitle) ? currentTitle : undefined
        }
        defaultQid={run(() => {
          const suffix = currentQid?.startsWith(DRAFT_QID_PREFIX)
            ? currentQid.slice(DRAFT_QID_PREFIX.length)
            : (currentQid ?? undefined);
          if (suffix && /^draft_\d+$/.test(suffix)) return undefined;
          return suffix;
        })}
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
