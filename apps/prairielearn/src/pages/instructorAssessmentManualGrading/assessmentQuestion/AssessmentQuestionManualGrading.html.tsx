import { useChat } from '@ai-sdk/react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import { type ChatMessage, Messages } from '../../../components/ChatMessages.js';
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

function partToChatContent(part: UIMessage['parts'][0]): string | null {
  if (part.type === 'text') {
    return part.text;
  }
  return null;
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
      parts: m.parts.map((part: { type: string; text?: string }) => {
        if (part.type === 'text') {
          return { type: 'text' as const, text: part.text ?? '' };
        }
        return { type: 'text' as const, text: '' };
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

  const chatMessages: ChatMessage[] = messages
    .map((m) => {
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.parts
          .map((part) => partToChatContent(part))
          .filter((text): text is string => text != null)
          .join('\n\n'),
      };
    })
    .filter((message) => message.content.length > 0);
  const displayedChatMessages = chatMessages;

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
          <Messages
            messages={displayedChatMessages}
            renderAfterMessage={(message) => {
              const jobSequenceId = jobSequenceByMessageId.get(message.id);

              if (message.role !== 'assistant') return null;

              return (
                <div className="mb-3">
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
            }}
          />
          {isGenerating && (
            <div className="d-flex align-items-center gap-1 small text-muted">
              <div className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Working...</span>
              </div>
              Working...
            </div>
          )}
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
              <button type="button" className="btn btn-outline-success btn-sm" onClick={() => {}}>
                <i className="bi bi-play-fill me-1" />
                Start AI grading
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
