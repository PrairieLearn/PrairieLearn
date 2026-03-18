import { useChat } from '@ai-sdk/react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type ToolUIPart, type UIMessage } from 'ai';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import { type ChatMessage, Messages } from '../../../components/ChatMessages.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import type {
  StaffAssessment,
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
import { type RubricData, RubricDataSchema } from '../../../lib/manualGrading.types.js';

import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';
import { AiGradingUnavailableModal } from './components/AiGradingUnavailableModal.js';
import { AssessmentQuestionTable } from './components/AssessmentQuestionTable.js';
import {
  type ConflictModalState,
  GradingConflictModal,
} from './components/GradingConflictModal.js';
import { GradingPromptInput } from './components/GradingPromptInput.js';
import { GroupInfoModal, type GroupInfoModalState } from './components/GroupInfoModal.js';
import { createManualGradingTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';
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
}

type AssessmentQuestionManualGradingInnerProps = Omit<
  AssessmentQuestionManualGradingProps,
  'search' | 'isDevMode' | 'trpcCsrfToken'
>;

type RubricChatMessage = UIMessage<{
  job_sequence_id?: string;
  status?: 'streaming' | 'completed' | 'errored';
}>;

const GENERATE_NEW_RUBRIC_PROMPT = 'Generate a new rubric.';

function parseRubricData(data: unknown): RubricData | null {
  const parsedRubricData = RubricDataSchema.nullable().safeParse(data);
  return parsedRubricData.success ? parsedRubricData.data : null;
}

function sanitizeMessagesForServer(messages: RubricChatMessage[]): RubricChatMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter(
        (part) =>
          part.type === 'text' ||
          !isToolPart(part) ||
          (part.type !== 'tool-get_initialization_context' && part.type !== 'tool-set_rubric'),
      ),
    }))
    .filter((message) => message.parts.length > 0);
}

function isToolPart(part: UIMessage['parts'][0]): part is ToolUIPart {
  return part.type.startsWith('tool-');
}

function partToChatContent(part: UIMessage['parts'][0]): string | null {
  if (part.type === 'text') {
    return part.text;
  }

  if (!isToolPart(part)) {
    return null;
  }

  if (part.type === 'tool-get_initialization_context') {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      return 'Calling tool: Get initialization context...';
    }
    if (part.state === 'output-available') {
      return 'Tool called: Get initialization context';
    }
    if (part.state === 'output-error') {
      return `Tool error while getting initialization context: ${part.errorText}`;
    }
    return null;
  }

  if (part.type === 'tool-set_rubric') {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      return 'Calling tool: Set rubric...';
    }
    if (part.state === 'output-available') {
      return 'Tool called: Set rubric';
    }
    if (part.state === 'output-error') {
      return `Tool error while setting rubric: ${part.errorText}`;
    }
    return null;
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
}: AssessmentQuestionManualGradingInnerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [groupInfoModalState, setGroupInfoModalState] = useState<GroupInfoModalState>(null);
  const [conflictModalState, setConflictModalState] = useState<ConflictModalState>(null);
  const [showAiGradingUnavailableModal, setShowAiGradingUnavailableModal] = useState(false);
  const [rubricDataState, setRubricDataState] = useState(() => parseRubricData(rubricData));
  const [aiGradingStatsState, setAiGradingStatsState] = useState(aiGradingStats);
  const [hasGeneratedRubric, setHasGeneratedRubric] = useState(false);

  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);
  const [chatInput, setChatInput] = useState('');

  const chatUrl = `${urlPrefix}/assessment/${assessment.id}/manual_grading/assessment_question/${assessmentQuestion.id}/chat`;
  const rubricDataUrl = `${chatUrl}/rubric_data`;

  const { messages, sendMessage, status } = useChat<RubricChatMessage>({
    transport: new DefaultChatTransport({
      api: chatUrl,
      headers: { 'X-CSRF-Token': chatCsrfToken },
      prepareSendMessagesRequest: ({ messages, headers, body }) => {
        return {
          headers,
          body: {
            ...body,
            messages: sanitizeMessagesForServer(messages),
          },
        };
      },
    }),
    onFinish({ message }) {
      const didSetRubric = message.parts.some(
        (part) =>
          isToolPart(part) && part.type === 'tool-set_rubric' && part.state === 'output-available',
      );
      if (!didSetRubric) {
        return;
      }

      setHasGeneratedRubric(true);
      triggerOpenRubricEditor();

      void fetch(rubricDataUrl, {
        headers: { 'X-CSRF-Token': chatCsrfToken },
      })
        .then(async (response) => {
          if (!response.ok) return;
          const data = (await response.json()) as {
            rubric_data: unknown;
            aiGradingStats: AiGradingGeneralStats | null;
          };
          const parsedRubricData = parseRubricData(data.rubric_data);
          setRubricDataState(parsedRubricData);
          setAiGradingStatsState(data.aiGradingStats);
        })
        .catch(() => {
          // Ignore chat-side fetch errors; users can still refresh manually.
        });

      void queryClient.invalidateQueries({
        queryKey: trpc.instances.queryKey(),
      });
    },
  });

  const isGenerating = status === 'streaming' || status === 'submitted';

  const latestJobSequenceId =
    [...messages].reverse().find((message) => message.metadata?.job_sequence_id != null)?.metadata
      ?.job_sequence_id ?? null;
  const lastAssistantMessageId =
    [...messages].reverse().find((message) => message.role === 'assistant')?.id ?? null;

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
        <div className="flex-grow-1 overflow-auto p-3">
          <Messages
            messages={displayedChatMessages}
            renderAfterMessage={(message) => {
              if (message.role !== 'assistant' || message.id !== lastAssistantMessageId) {
                return null;
              }

              return (
                <div className="mb-3">
                  <div className="d-flex flex-wrap gap-2">
                    {hasGeneratedRubric && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={triggerOpenRubricEditor}
                      >
                        Open rubric editor
                      </button>
                    )}
                  </div>
                </div>
              );
            }}
          />
        </div>
        <div className="p-3 border-top">
          {latestJobSequenceId && (
            <div className="mb-2 text-end">
              <a
                href={`${urlPrefix}/jobSequence/${latestJobSequenceId}`}
                target="_blank"
                rel="noreferrer"
                className="small"
              >
                View job logs ({latestJobSequenceId})
              </a>
            </div>
          )}
          {!hasGeneratedRubric && (
            <div className="d-flex justify-content-end mb-2">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                disabled={isGenerating}
                onClick={() => {
                  void sendMessage({ text: GENERATE_NEW_RUBRIC_PROMPT });
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
          {hasGeneratedRubric && (
            <div className="small text-muted mb-2">
              You can give suggestions in chat, or start AI grading.
            </div>
          )}
          <GradingPromptInput
            value={chatInput}
            disabled={false}
            isGenerating={isGenerating}
            onChange={setChatInput}
            onSubmit={(text) => {
              const trimmedText = text.trim();
              if (trimmedText.length === 0) {
                return;
              }
              void sendMessage({ text: trimmedText });
              setChatInput('');
            }}
            onStop={() => {}}
          />
        </div>
      </div>
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
  const [trpcClient] = useState(() => createManualGradingTrpcClient(trpcCsrfToken));
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
