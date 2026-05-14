import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import { run } from '@prairielearn/run';

import { b64DecodeUnicode } from '../../../lib/base64-util.js';
import { getAppError } from '../../../lib/client/errors.js';
import type { StaffQuestion } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { FinalizeModal } from './FinalizeModal.js';
import {
  type CodeEditorsHandle,
  type NewVariantHandle,
  QuestionAndFilePreview,
} from './QuestionAndFilePreview.js';
import { DRAFT_QID_PREFIX, QuestionTitleAndQid } from './QuestionTitleAndQid.js';
import type { SelectedQuestionFile } from './SelectedQuestionFileEditor.js';

async function fetchQuestionFiles(filesUrl: string): Promise<{
  questionFiles: Record<string, string>;
  allQuestionFiles: QuestionFileEntry[];
  selectedFile: SelectedQuestionFile | null;
}> {
  const response = await fetch(filesUrl, {
    headers: { Accept: 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return {
    questionFiles: data.files,
    allQuestionFiles: data.allFiles,
    selectedFile: data.selectedFile,
  };
}

interface QuestionFileEntry {
  path: string;
  size: number;
}

export interface DraftQuestionEditorSidebarProps {
  questionId: string;
  urlPrefix: string;
  refreshQuestionPreview: () => void;
  hasUnsavedChanges: boolean;
  discardUnsavedChanges: () => void;
  isQuestionEmpty: boolean;
  onGeneratingChange: (isGenerating: boolean) => void;
  onGenerationComplete: () => void;
}

export interface DraftQuestionEditorProps {
  question: StaffQuestion;
  questionFiles: Record<string, string>;
  allQuestionFiles: QuestionFileEntry[];
  selectedFile: SelectedQuestionFile | null;
  richTextEditorEnabled: boolean;
  urlPrefix: string;
  editorUrl: string;
  filesUrl: string;
  csrfToken: string;
  questionContainerHtml: string;
  variantUrl: string;
  variantCsrfToken: string;
  trpcCsrfToken: string;
  courseId: string;
  editErrorUrlPrefix: string;
}

export function DraftQuestionEditorContent({
  question,
  questionFiles: initialQuestionFiles,
  allQuestionFiles: initialAllQuestionFiles,
  selectedFile,
  richTextEditorEnabled,
  urlPrefix,
  editorUrl,
  filesUrl,
  csrfToken,
  questionContainerHtml,
  variantUrl,
  variantCsrfToken,
  editErrorUrlPrefix,
  renderSidebar,
}: Omit<DraftQuestionEditorProps, 'trpcCsrfToken' | 'courseId'> & {
  renderSidebar?: (props: DraftQuestionEditorSidebarProps) => ReactNode;
}) {
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(question.title);
  const [currentQid, setCurrentQid] = useState(question.qid);
  const newVariantRef = useRef<NewVariantHandle>(null);
  const codeEditorsRef = useRef<CodeEditorsHandle>(null);
  const trpc = useTRPC();
  const finalizeDraftMutation = useMutation({
    ...trpc.questions.finalizeDraft.mutationOptions(),
    onSuccess: ({ previewUrl }) => {
      window.location.assign(previewUrl);
    },
  });
  const {
    error: finalizeDraftMutationError,
    isPending: isFinalizingDraft,
    mutate: finalizeDraft,
    reset: resetFinalizeDraft,
  } = finalizeDraftMutation;
  const finalizeDraftError = getAppError<QuestionsError['FinalizeDraft']>(
    finalizeDraftMutationError,
  );

  const handleTitleAndQidSaved = useCallback(
    (update: { qid: string | null; title: string | null }) => {
      setCurrentQid(update.qid);
      setCurrentTitle(update.title);
    },
    [],
  );

  const {
    data: questionFilesData,
    error: filesError,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: ['question-files', filesUrl],
    queryFn: () => fetchQuestionFiles(filesUrl),
    staleTime: Infinity,
    initialData: {
      questionFiles: initialQuestionFiles,
      allQuestionFiles: initialAllQuestionFiles,
      selectedFile,
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
  const { questionFiles, allQuestionFiles, selectedFile: currentSelectedFile } = questionFilesData;

  const isQuestionEmpty = useMemo(
    () => b64DecodeUnicode(questionFiles['question.html'] ?? '').trim() === '',
    [questionFiles],
  );
  const sidebar = renderSidebar?.({
    questionId: question.id,
    urlPrefix,
    refreshQuestionPreview: () => newVariantRef.current?.newVariant(),
    hasUnsavedChanges,
    discardUnsavedChanges: () => codeEditorsRef.current?.discardChanges(),
    isQuestionEmpty,
    onGeneratingChange: setIsGenerating,
    onGenerationComplete: () => refetchFiles(),
  });

  return (
    <div className={sidebar ? 'app-content' : 'app-content app-content-no-chat'}>
      {sidebar}

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
                className={`nav-link ${currentSelectedFile == null ? 'active' : ''}`}
                data-bs-toggle="tab"
                aria-current={currentSelectedFile == null ? 'page' : undefined}
                href="#question-preview"
              >
                Preview
              </a>
            </li>
            <li className="nav-item">
              <a className="nav-link" data-bs-toggle="tab" href="#question-code">
                Question
              </a>
            </li>
            <li className="nav-item">
              <a
                className={`nav-link ${currentSelectedFile != null ? 'active' : ''}`}
                data-bs-toggle="tab"
                aria-current={currentSelectedFile != null ? 'page' : undefined}
                href="#question-all-files"
              >
                All files
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
          allQuestionFiles={allQuestionFiles}
          selectedFile={currentSelectedFile}
          richTextEditorEnabled={richTextEditorEnabled}
          questionContainerHtml={questionContainerHtml}
          csrfToken={csrfToken}
          variantUrl={variantUrl}
          variantCsrfToken={variantCsrfToken}
          newVariantRef={newVariantRef}
          codeEditorsRef={codeEditorsRef}
          isGenerating={isGenerating}
          filesError={filesError}
          hasAiSidebar={sidebar != null}
          questionId={question.id}
          qid={currentQid}
          urlPrefix={urlPrefix}
          editorUrl={editorUrl}
          onHasUnsavedChanges={setHasUnsavedChanges}
          onRetryFiles={() => refetchFiles()}
        />
      </div>
      <FinalizeModal
        // Key on the current values so the uncontrolled inputs reset when the
        // user edits the title/QID inline and reopens the modal.
        key={`${currentTitle ?? ''}::${currentQid ?? ''}`}
        csrfToken={csrfToken}
        editErrorUrlPrefix={editErrorUrlPrefix}
        isFinalizing={isFinalizingDraft}
        error={finalizeDraftError}
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
        onDismissError={resetFinalizeDraft}
        onFinalize={({ title, qid }) => finalizeDraft({ questionId: question.id, title, qid })}
        onHide={() => setShowFinalizeModal(false)}
      />
    </div>
  );
}

export function DraftQuestionEditor(props: DraftQuestionEditorProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: props.trpcCsrfToken, courseId: props.courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <DraftQuestionEditorContent {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

DraftQuestionEditor.displayName = 'DraftQuestionEditor';

export type { SelectedQuestionFile } from './SelectedQuestionFileEditor.js';
