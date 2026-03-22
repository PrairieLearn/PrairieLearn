import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type ToolUIPart, type UIMessage } from 'ai';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { NuqsAdapter } from '@prairielearn/ui';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import type {
  StaffAiGradingMessage,
  StaffAssessment,
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';
import { createAssessmentQuestionTrpcClient } from '../../../trpc/assessmentQuestion/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/assessmentQuestion/context.js';

import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';
import { AiGradingUnavailableModal } from './components/AiGradingUnavailableModal.js';
import { AssessmentQuestionTable } from './components/AssessmentQuestionTable.js';
import {
  type ConflictModalState,
  GradingConflictModal,
} from './components/GradingConflictModal.js';
import { GradingPromptInput } from './components/GradingPromptInput.js';
import { GroupInfoModal, type GroupInfoModalState } from './components/GroupInfoModal.js';
import { useManualGradingActions } from './utils/useManualGradingActions.js';

interface AssessmentQuestionManualGradingProps {
  hasCourseInstancePermissionEdit: boolean;
  course: PageContext<'assessmentQuestion', 'instructor'>['course'];
  courseInstance: PageContext<'assessmentQuestion', 'instructor'>['course_instance'];
  csrfToken: string;
  trpcCsrfToken: string;
  instanceQuestionsInfo: InstanceQuestionRowWithAIGradingStats[];
  urlPrefix: string;
  assessment: StaffAssessment;
  assessmentQuestion: StaffAssessmentQuestion;
  questionQid: string;
  aiGradingEnabled: boolean;
  aiGradingModelSelectionEnabled: boolean;
  initialAiGradingMode: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  courseStaff: StaffUser[];
  aiGradingStats: AiGradingGeneralStats | null;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
  numOpenInstances: number;
  search: string;
  isDevMode: boolean;
  questionTitle: string;
  questionNumber: number;
  availableAiGradingProviders: EnumAiGradingProvider[];
  chatCsrfToken: string;
  initialChatMessages: StaffAiGradingMessage[];
}

type AssessmentQuestionManualGradingInnerProps = Omit<
  AssessmentQuestionManualGradingProps,
  'search' | 'isDevMode' | 'trpcCsrfToken'
>;

type RubricPhase = 'generate' | 'edit';

type RubricChatMessage = UIMessage<{
  job_sequence_id?: string;
  status?: 'streaming' | 'completed' | 'errored';
  phase?: RubricPhase;
  rubric_modified?: boolean;
}>;

// ---------------------------------------------------------------------------
// Tool call rendering (adapted from AiQuestionGenerationChat.tsx)
// ---------------------------------------------------------------------------

function isToolPart(part: UIMessage['parts'][0]): part is ToolUIPart {
  return part.type.startsWith('tool-');
}

function ToolCallStatus({
  state,
  statusText,
}: {
  state: Exclude<
    ToolUIPart['state'],
    'approval-requested' | 'approval-responded' | 'output-denied' | undefined
  >;
  statusText: ReactNode;
}) {
  const icon = run(() => {
    switch (state) {
      case 'input-streaming':
      case 'input-available':
        return (
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        );
      case 'output-available':
        return <i className="bi bi-check-lg text-success" aria-hidden="true" />;
      case 'output-error':
        return <i className="bi bi-x text-danger" aria-hidden="true" />;
    }
  });

  return (
    <div className="d-flex flex-row align-items-center gap-1 small text-muted">
      {icon}
      <span>{statusText}</span>
    </div>
  );
}

function getToolStatusText(
  state: ToolUIPart['state'],
  messages: { streaming: string; pending: string; done: string; error: string },
): string {
  switch (state) {
    case 'input-streaming':
      return messages.streaming;
    case 'input-available':
      return messages.pending;
    case 'output-available':
      return messages.done;
    case 'output-error':
      return messages.error;
    default:
      return messages.pending;
  }
}

const TOOL_STATUS_MESSAGES: Record<
  string,
  { streaming: string; pending: string; done: string; error: string }
> = {
  'tool-generateRubric': {
    streaming: 'Generating rubric...',
    pending: 'Generating rubric...',
    done: 'Generated rubric',
    error: 'Error generating rubric',
  },
  'tool-getRubric': {
    streaming: 'Reading rubric...',
    pending: 'Reading rubric...',
    done: 'Read rubric',
    error: 'Error reading rubric',
  },
  'tool-getRubricItem': {
    streaming: 'Reading rubric item...',
    pending: 'Reading rubric item...',
    done: 'Read rubric item',
    error: 'Error reading rubric item',
  },
  'tool-addRubricItem': {
    streaming: 'Adding rubric item...',
    pending: 'Adding rubric item...',
    done: 'Added rubric item',
    error: 'Error adding rubric item',
  },
  'tool-editRubricItem': {
    streaming: 'Editing rubric item...',
    pending: 'Editing rubric item...',
    done: 'Edited rubric item',
    error: 'Error editing rubric item',
  },
  'tool-deleteRubricItem': {
    streaming: 'Deleting rubric item...',
    pending: 'Deleting rubric item...',
    done: 'Deleted rubric item',
    error: 'Error deleting rubric item',
  },
  'tool-swapRubricItems': {
    streaming: 'Swapping rubric items...',
    pending: 'Swapping rubric items...',
    done: 'Swapped rubric items',
    error: 'Error swapping rubric items',
  },
  'tool-editRubricSettings': {
    streaming: 'Updating rubric settings...',
    pending: 'Updating rubric settings...',
    done: 'Updated rubric settings',
    error: 'Error updating rubric settings',
  },
  'tool-getAssessmentQuestionPoints': {
    streaming: 'Reading question points...',
    pending: 'Reading question points...',
    done: 'Read question points',
    error: 'Error reading question points',
  },
  'tool-getQuestionContent': {
    streaming: 'Reading question content...',
    pending: 'Reading question content...',
    done: 'Read question content',
    error: 'Error reading question content',
  },
  'tool-getSampleSubmissions': {
    streaming: 'Reading sample submissions...',
    pending: 'Reading sample submissions...',
    done: 'Read sample submissions',
    error: 'Error reading sample submissions',
  },
  'tool-startAiGrading': {
    streaming: 'Running AI grading...',
    pending: 'Running AI grading...',
    done: 'AI grading complete',
    error: 'Error running AI grading',
  },
};

function ToolCall({ part }: { part: ToolUIPart }) {
  if (
    part.state === 'approval-requested' ||
    part.state === 'approval-responded' ||
    part.state === 'output-denied'
  ) {
    return null;
  }

  const messages = TOOL_STATUS_MESSAGES[part.type] ?? {
    streaming: 'Working...',
    pending: 'Working...',
    done: 'Done',
    error: 'Error',
  };

  return <ToolCallStatus state={part.state} statusText={getToolStatusText(part.state, messages)} />;
}

function MessageParts({ parts }: { parts: UIMessage['parts'] }) {
  return (
    <>
      {parts.map((part, index) => {
        const key = `part-${index}`;
        if (isToolPart(part)) {
          return <ToolCall key={key} part={part} />;
        } else if (part.type === 'text') {
          if (!part.text) return null;
          return (
            <div key={key} style={{ whiteSpace: 'pre-wrap' }}>
              {part.text}
            </div>
          );
        } else if (part.type === 'step-start') {
          return null;
        }
        return null;
      })}
    </>
  );
}

function triggerOpenRubricEditor() {
  const scrollToRubricEditor = () => {
    const rubricEditorElement = document.getElementById('rubric-editor');
    if (!rubricEditorElement) return;

    rubricEditorElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const rubricSettingsToggleButton = document.querySelector<HTMLButtonElement>(
    '#rubric-editor [data-bs-target="#rubric-setting"]',
  );
  if (rubricSettingsToggleButton?.classList.contains('collapsed')) {
    rubricSettingsToggleButton.click();
    window.setTimeout(scrollToRubricEditor, 250);
    return;
  }

  scrollToRubricEditor();
}

function persistedMessagesToInitialMessages(
  persistedMessages: StaffAiGradingMessage[],
): RubricChatMessage[] {
  return persistedMessages
    .filter((m) => m.status === 'completed')
    .map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts.map((part: Record<string, unknown>) => {
        if (part.type === 'text') {
          return { type: 'text' as const, text: (part.text as string | undefined) ?? '' };
        }
        // Pass through tool parts and other part types as-is
        return part as UIMessage['parts'][0];
      }),
      metadata: {
        job_sequence_id: m.job_sequence_id ?? undefined,
        status: m.status as 'streaming' | 'completed' | 'errored',
        phase: m.phase as RubricPhase,
      },
    }));
}

function AssessmentQuestionManualGradingInner({
  hasCourseInstancePermissionEdit,
  instanceQuestionsInfo,
  course,
  courseInstance,
  urlPrefix,
  csrfToken,
  assessment,
  assessmentQuestion,
  questionQid,
  aiGradingEnabled,
  aiGradingModelSelectionEnabled,
  initialAiGradingMode,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  aiGradingStats,
  initialOngoingJobSequenceTokens,
  numOpenInstances,
  questionTitle,
  questionNumber,
  availableAiGradingProviders,
  chatCsrfToken,
  initialChatMessages,
}: AssessmentQuestionManualGradingInnerProps) {
  const initialRubricData = rubricData;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [groupInfoModalState, setGroupInfoModalState] = useState<GroupInfoModalState>(null);
  const [conflictModalState, setConflictModalState] = useState<ConflictModalState>(null);
  const [showAiGradingUnavailableModal, setShowAiGradingUnavailableModal] = useState(false);
  const [rubricDataState, setRubricDataState] = useState(initialRubricData);
  const [aiGradingStatsState, setAiGradingStatsState] = useState(aiGradingStats);
  const [isGradingInProgress, setIsGradingInProgress] = useState(false);

  const workflowActionMutation = useMutation(trpc.workflowAction.mutationOptions());

  const hasPersistedGenerateMessage = initialChatMessages.some(
    (m) => m.phase === 'generate' && m.role === 'assistant' && m.status === 'completed',
  );
  const [hasGeneratedRubric, setHasGeneratedRubric] = useState(
    initialRubricData != null || hasPersistedGenerateMessage,
  );
  const hasGeneratedRubricRef = useRef(initialRubricData != null || hasPersistedGenerateMessage);

  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);
  const [chatInput, setChatInput] = useState('');
  const currentPhaseRef = useRef<RubricPhase>('generate');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const chatUrl = `${urlPrefix}/assessment/${assessment.id}/manual_grading/assessment_question/${assessmentQuestion.id}/chat`;
  const rubricDataUrl = `${chatUrl}/rubric_data`;

  const refreshRubricData = () => {
    void fetch(rubricDataUrl, {
      headers: { 'X-CSRF-Token': chatCsrfToken },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          rubric_data: unknown;
          aiGradingStats: AiGradingGeneralStats | null;
        };
        setRubricDataState(data.rubric_data as RubricData | null);
        setAiGradingStatsState(data.aiGradingStats);
      })
      .catch(() => {
        // Ignore chat-side fetch errors; users can still refresh manually.
      });
  };

  const { messages, setMessages, sendMessage, status } = useChat<RubricChatMessage>({
    messages: persistedMessagesToInitialMessages(initialChatMessages),
    transport: new DefaultChatTransport({
      api: chatUrl,
      headers: { 'X-CSRF-Token': chatCsrfToken },
      prepareSendMessagesRequest: ({ messages: chatMsgs, headers, body }) => {
        const lastMessage = chatMsgs[chatMsgs.length - 1];
        const messageText =
          lastMessage.role === 'user'
            ? (lastMessage.parts as { type: string; text?: string }[])
                .map((p) => (p.type === 'text' ? (p.text ?? '') : ''))
                .filter(Boolean)
                .join('\n\n')
            : '';
        return {
          headers,
          body: {
            ...body,
            phase: currentPhaseRef.current,
            message: messageText,
          },
        };
      },
    }),
    onFinish({ message }) {
      const phase = message.metadata?.phase;

      if (phase === 'generate') {
        setHasGeneratedRubric(true);
        hasGeneratedRubricRef.current = true;
        triggerOpenRubricEditor();
        refreshRubricData();

        void queryClient.invalidateQueries({
          queryKey: trpc.instances.queryKey(),
        });
        return;
      }

      if (phase === 'edit') {
        const rubricModified = message.metadata?.rubric_modified ?? false;
        if (rubricModified) {
          setHasGeneratedRubric(true);
          hasGeneratedRubricRef.current = true;
          triggerOpenRubricEditor();
          refreshRubricData();

          void queryClient.invalidateQueries({
            queryKey: trpc.instances.queryKey(),
          });
        }
      }
    },
  });

  const isGenerating = status === 'streaming' || status === 'submitted';

  // Build a lookup of message id -> job_sequence_id for per-message job logs
  const jobSequenceByMessageId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      const jsId = m.metadata?.job_sequence_id;
      if (jsId) {
        map.set(m.id, jsId);
      }
    }
    return map;
  }, [messages]);

  // AI grading is available only if the question uses manual grading.
  const isAiGradingAvailable = (assessmentQuestion.max_manual_points ?? 0) > 0;

  const mutations = useManualGradingActions();
  const { setAiGradingModeMutation, groupSubmissionMutation } = mutations;

  const handleClearChat = () => {
    setShowClearConfirm(false);
    void fetch(`${chatUrl}/clear`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': chatCsrfToken },
    }).then((response) => {
      if (response.ok) {
        setMessages([]);
        setHasGeneratedRubric(initialRubricData != null);
        hasGeneratedRubricRef.current = initialRubricData != null;
      }
    });
  };

  return (
    <div className="d-flex flex-row gap-3" style={{ maxHeight: '80vh' }}>
      <div className="flex-grow-1" style={{ minWidth: 0, overflowY: 'auto' }}>
        {setAiGradingModeMutation.isError && (
          <Alert
            variant="danger"
            className="mb-3"
            dismissible
            onClose={() => setAiGradingModeMutation.reset()}
          >
            <strong>Error:</strong> {setAiGradingModeMutation.error.message}
          </Alert>
        )}
        <div className="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-0">
              <li className="breadcrumb-item">
                <a href={`${urlPrefix}/assessment/${assessment.id}/manual_grading`}>
                  Manual grading
                </a>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                Question {questionNumber}. {questionTitle}
              </li>
            </ol>
          </nav>
          {aiGradingEnabled && (
            <div className="card px-3 py-2 mb-0">
              <div
                className={`form-check form-switch mb-0 ${isAiGradingAvailable ? 'opacity-100' : 'opacity-75'}`}
              >
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="switchCheckDefault"
                  checked={aiGradingMode}
                  onChange={() => {
                    if (!isAiGradingAvailable) {
                      setShowAiGradingUnavailableModal(true);
                      return;
                    }
                    setAiGradingModeMutation.mutate(
                      { enabled: !aiGradingMode },
                      {
                        onSuccess: () => {
                          setAiGradingMode((prev) => !prev);
                        },
                      },
                    );
                  }}
                />
                <label className="form-check-label" htmlFor="switchCheckDefault">
                  <i className="bi bi-stars" />
                  AI grading mode
                </label>
              </div>
            </div>
          )}
        </div>
        <AssessmentQuestionTable
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
          course={course}
          courseInstance={courseInstance}
          csrfToken={csrfToken}
          instanceQuestionsInfo={instanceQuestionsInfo}
          urlPrefix={urlPrefix}
          assessment={assessment}
          assessmentQuestion={assessmentQuestion}
          questionQid={questionQid}
          aiGradingMode={aiGradingMode}
          aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
          rubricData={rubricDataState}
          rubricEditingDisabled={isGenerating}
          instanceQuestionGroups={instanceQuestionGroups}
          courseStaff={courseStaff}
          aiGradingStats={aiGradingStatsState}
          mutations={mutations}
          initialOngoingJobSequenceTokens={initialOngoingJobSequenceTokens}
          availableAiGradingProviders={availableAiGradingProviders}
          onSetGroupInfoModalState={setGroupInfoModalState}
          onSetConflictModalState={setConflictModalState}
        />

        <GroupInfoModal
          modalState={groupInfoModalState}
          numOpenInstances={numOpenInstances}
          mutation={groupSubmissionMutation}
          onHide={() => setGroupInfoModalState(null)}
        />

        <GradingConflictModal
          modalState={conflictModalState}
          onHide={() => {
            setConflictModalState(null);
            // Refetch the table data to show the latest state.
            void queryClient.invalidateQueries({
              queryKey: trpc.instances.queryKey(),
            });
          }}
        />

        <AiGradingUnavailableModal
          show={showAiGradingUnavailableModal}
          onHide={() => setShowAiGradingUnavailableModal(false)}
        />
      </div>
      <div className="d-flex flex-column bg-light border rounded" style={{ width: 350 }}>
        <div className="d-flex justify-content-between align-items-center p-3 pb-0">
          <span className="fw-bold small">AI assistant</span>
          {messages.length > 0 && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={isGenerating}
              aria-label="Clear chat history"
              onClick={() => setShowClearConfirm(true)}
            >
              <i className="bi bi-trash" />
            </button>
          )}
        </div>
        <div className="flex-grow-1 overflow-auto p-3">
          {messages.map((message) => {
            const jobSequenceId = jobSequenceByMessageId.get(message.id);

            if (message.role === 'user') {
              const textContent = message.parts
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .filter(Boolean)
                .join('\n\n');
              if (!textContent) return null;
              return (
                <div key={message.id} className="d-flex flex-row-reverse mb-3">
                  <div
                    className="d-flex flex-column gap-2 p-3 rounded bg-secondary-subtle"
                    style={{ maxWidth: '90%', whiteSpace: 'pre-wrap' }}
                  >
                    {textContent}
                  </div>
                </div>
              );
            }

            return (
              <div key={message.id} className="d-flex flex-column gap-1 mb-3">
                <MessageParts parts={message.parts} />
                {jobSequenceId && (
                  <a
                    className="small"
                    href={`${urlPrefix}/jobSequence/${jobSequenceId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View job logs
                  </a>
                )}
              </div>
            );
          })}
          {isGenerating &&
            (() => {
              // Hide the global "Working..." spinner when the last assistant message
              // already has visible parts (tool call spinners or text).
              const lastMsg = messages.at(-1);
              const hasVisibleParts =
                lastMsg?.role === 'assistant' &&
                lastMsg.parts.some((p) => (p.type === 'text' && p.text) || isToolPart(p));
              if (hasVisibleParts) return null;
              return (
                <div className="d-flex align-items-center gap-1 small text-muted">
                  <div className="spinner-border spinner-border-sm" role="status">
                    <span className="visually-hidden">Working...</span>
                  </div>
                  Working...
                </div>
              );
            })()}
        </div>
        <div className="p-3 border-top">
          {!hasGeneratedRubric && (
            <div className="d-flex justify-content-end mb-2">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                disabled={isGenerating}
                onClick={() => {
                  currentPhaseRef.current = 'generate';
                  void sendMessage({ text: 'Generate a new rubric.' });
                }}
              >
                <i className="bi bi-stars me-1" />
                Generate a new rubric
              </button>
            </div>
          )}
          {hasGeneratedRubric && (
            <div className="d-flex justify-content-end mb-2">
              <button
                type="button"
                className="btn btn-outline-success btn-sm"
                disabled={isGradingInProgress || workflowActionMutation.isPending}
                onClick={() => {
                  setIsGradingInProgress(true);
                  workflowActionMutation.mutate(
                    { action: 'proceed' },
                    {
                      onError: () => setIsGradingInProgress(false),
                    },
                  );
                }}
              >
                {workflowActionMutation.isPending || isGradingInProgress ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-1"
                      role="status"
                      aria-hidden="true"
                    />
                    Grading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-play-fill me-1" />
                    Start AI grading
                  </>
                )}
              </button>
            </div>
          )}
          <GradingPromptInput
            value={chatInput}
            disabled={!hasGeneratedRubric}
            isGenerating={isGenerating}
            onChange={setChatInput}
            onSubmit={(text) => {
              const trimmedText = text.trim();
              if (trimmedText.length === 0) {
                return;
              }
              currentPhaseRef.current = 'edit';
              void sendMessage({ text: trimmedText });
              setChatInput('');
            }}
            onStop={() => {}}
          />
        </div>
      </div>

      <Modal show={showClearConfirm} centered onHide={() => setShowClearConfirm(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Clear chat history</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to clear the chat history? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowClearConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleClearChat}>
            Clear chat
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export function AssessmentQuestionManualGrading({
  search,
  isDevMode,
  trpcCsrfToken,
  ...innerProps
}: AssessmentQuestionManualGradingProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentQuestionTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: innerProps.courseInstance.id,
      assessmentId: innerProps.assessment.id,
      assessmentQuestionId: innerProps.assessmentQuestion.id,
    }),
  );
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AssessmentQuestionManualGradingInner {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionManualGrading.displayName = 'AssessmentQuestionManualGrading';
