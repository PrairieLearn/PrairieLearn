import { useChat } from '@ai-sdk/react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type ToolUIPart, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import {
  type ChatMessage,
  type ChatMessagePart,
  Messages,
} from '../../../components/ChatMessages.js';
import type {
  AiRubricItemDiff,
  AiRubricItemDiffField,
} from '../../../components/RubricSettings.js';
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
const PROPOSAL_TOOL_TYPES = [
  'tool-propose_add_rubric_item',
  'tool-propose_edit_rubric_item',
  'tool-propose_delete_rubric_item',
  'tool-propose_undo_rubric_item_change',
] as const;

type ProposalToolType = (typeof PROPOSAL_TOOL_TYPES)[number];

function parseRubricData(data: unknown): RubricData | null {
  const parsedRubricData = RubricDataSchema.nullable().safeParse(data);
  return parsedRubricData.success ? parsedRubricData.data : null;
}

function isProposalToolType(type: string): type is ProposalToolType {
  return (PROPOSAL_TOOL_TYPES as readonly string[]).includes(type);
}

function parseAiRubricItemDiffs(data: unknown): Partial<Record<number, AiRubricItemDiff>> {
  if (typeof data !== 'object' || data == null) {
    return {};
  }

  const allowedStatuses = new Set<AiRubricItemDiff['status']>(['new', 'updated', 'removed']);
  const allowedFields = new Set<AiRubricItemDiffField>([
    'points',
    'description',
    'explanation',
    'grader_note',
    'always_show_to_students',
  ]);

  const parsedDiffs: Partial<Record<number, AiRubricItemDiff>> = {};
  for (const [rawIndex, rawDiff] of Object.entries(data)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) continue;
    if (typeof rawDiff !== 'object' || rawDiff == null) continue;

    const status = (rawDiff as { status?: unknown }).status;
    if (typeof status !== 'string' || !allowedStatuses.has(status as AiRubricItemDiff['status'])) {
      continue;
    }

    const changedFieldsRaw = (rawDiff as { changed_fields?: unknown }).changed_fields;
    const changed_fields = Array.isArray(changedFieldsRaw)
      ? changedFieldsRaw.filter(
          (field): field is AiRubricItemDiffField =>
            typeof field === 'string' && allowedFields.has(field as AiRubricItemDiffField),
        )
      : [];

    const descriptionRaw = (rawDiff as { description?: unknown }).description;
    const parsedStatus = status as AiRubricItemDiff['status'];
    parsedDiffs[index] = {
      status: parsedStatus,
      changed_fields,
      description: typeof descriptionRaw === 'string' ? descriptionRaw : '',
    };
  }

  return parsedDiffs;
}

function sanitizeMessagesForServer(messages: RubricChatMessage[]): RubricChatMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter(
        (part) =>
          part.type === 'text' ||
          !isToolPart(part) ||
          (part.type !== 'tool-get_initialization_context' &&
            part.type !== 'tool-get_rubric_items' &&
            part.type !== 'tool-set_rubric' &&
            !isProposalToolType(part.type)),
      ),
    }))
    .filter((message) => message.parts.length > 0);
}

function isToolPart(part: UIMessage['parts'][0]): part is ToolUIPart {
  return part.type.startsWith('tool-');
}

function partToChatPart(part: UIMessage['parts'][0]): ChatMessagePart | null {
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }

  if (!isToolPart(part)) {
    return null;
  }

  const getToolState = (): 'streaming' | 'success' | 'error' => {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      return 'streaming';
    }
    if (part.state === 'output-available') {
      return 'success';
    }
    return 'error';
  };

  if (part.type === 'tool-get_initialization_context') {
    return {
      type: 'tool',
      state: getToolState(),
      text:
        part.state === 'output-error'
          ? `Error getting initialization context: ${part.errorText}`
          : 'Get initialization context',
    };
  }

  if (part.type === 'tool-get_rubric_items') {
    return {
      type: 'tool',
      state: getToolState(),
      text:
        part.state === 'output-error'
          ? `Error getting rubric items: ${part.errorText}`
          : 'Get rubric items',
    };
  }

  if (part.type === 'tool-set_rubric') {
    return {
      type: 'tool',
      state: getToolState(),
      text:
        part.state === 'output-error' ? `Error setting rubric: ${part.errorText}` : 'Set rubric',
    };
  }

  if (part.type === 'tool-propose_add_rubric_item') {
    return {
      type: 'tool',
      state: getToolState(),
      text:
        part.state === 'output-error'
          ? `Error proposing rubric addition: ${part.errorText}`
          : 'Propose add rubric item',
    };
  }

  if (part.type === 'tool-propose_edit_rubric_item') {
    return {
      type: 'tool',
      state: getToolState(),
      text:
        part.state === 'output-error'
          ? `Error proposing rubric edit: ${part.errorText}`
          : 'Propose edit rubric item',
    };
  }

  if (part.type === 'tool-propose_delete_rubric_item') {
    return {
      type: 'tool',
      state: getToolState(),
      text:
        part.state === 'output-error'
          ? `Error proposing rubric deletion: ${part.errorText}`
          : 'Propose delete rubric item',
    };
  }

  if (part.type === 'tool-propose_undo_rubric_item_change') {
    return {
      type: 'tool',
      state: getToolState(),
      text:
        part.state === 'output-error'
          ? `Error undoing rubric change: ${part.errorText}`
          : 'Undo rubric item change',
    };
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
  const [committedRubricDataState, setCommittedRubricDataState] = useState(() =>
    parseRubricData(rubricData),
  );
  const [aiGradingStatsState, setAiGradingStatsState] = useState(aiGradingStats);
  const [hasGeneratedRubric, setHasGeneratedRubric] = useState(false);
  const [aiRubricItemDiffsState, setAiRubricItemDiffsState] = useState<
    Partial<Record<number, AiRubricItemDiff>>
  >({});
  const [isApplyingProposedChanges, setIsApplyingProposedChanges] = useState(false);
  const [localActionMessages, setLocalActionMessages] = useState<ChatMessage[]>([]);
  const localActionMessageCounterRef = useRef(0);
  const lastAppliedProposalSignatureRef = useRef<string | null>(null);

  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);
  const [chatInput, setChatInput] = useState('');

  const chatUrl = `${urlPrefix}/assessment/${assessment.id}/manual_grading/assessment_question/${assessmentQuestion.id}/chat`;
  const rubricDataUrl = `${chatUrl}/rubric_data`;
  const hasPendingRubricProposals = Object.keys(aiRubricItemDiffsState).length > 0;

  const { messages, sendMessage, status } = useChat<RubricChatMessage>({
    transport: new DefaultChatTransport({
      api: chatUrl,
      headers: { 'X-CSRF-Token': chatCsrfToken },
      body: {
        rubric_generation_completed: hasGeneratedRubric,
        staged_rubric_data: rubricDataState,
        staged_rubric_item_diffs: aiRubricItemDiffsState,
      },
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
          setCommittedRubricDataState(parsedRubricData);
          setAiRubricItemDiffsState({});
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

  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state, @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
  useEffect(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (!latestAssistantMessage) return;

    const latestProposalPart = [...latestAssistantMessage.parts].reverse().find((part) => {
      return isToolPart(part) && isProposalToolType(part.type) && part.state === 'output-available';
    });
    if (!latestProposalPart || !isToolPart(latestProposalPart)) return;

    const toolOutput = latestProposalPart.output as {
      proposed_rubric?: unknown;
      proposed_rubric_item_diffs?: unknown;
    };
    const signature = `${latestAssistantMessage.id}:${latestProposalPart.type}:${JSON.stringify(
      toolOutput.proposed_rubric_item_diffs ?? {},
    )}`;
    if (lastAppliedProposalSignatureRef.current === signature) return;

    const proposedRubricData = parseRubricData(toolOutput.proposed_rubric);
    if (!proposedRubricData) return;

    lastAppliedProposalSignatureRef.current = signature;
    setRubricDataState(proposedRubricData);
    setAiRubricItemDiffsState(parseAiRubricItemDiffs(toolOutput.proposed_rubric_item_diffs));
    triggerOpenRubricEditor();
  }, [messages]);
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state, @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

  const isGenerating = status === 'streaming' || status === 'submitted';
  const latestJobSequenceId =
    [...messages].reverse().find((message) => message.metadata?.job_sequence_id != null)?.metadata
      ?.job_sequence_id ?? null;

  const postDeterministicActionMessage = (text: string) => {
    localActionMessageCounterRef.current += 1;
    setLocalActionMessages((prev) => [
      ...prev,
      {
        id: `local-action-${localActionMessageCounterRef.current}`,
        role: 'assistant',
        parts: [{ type: 'text', text }],
      },
    ]);
  };

  const chatMessages: ChatMessage[] = messages
    .map((m) => {
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        parts: m.parts
          .map((part) => partToChatPart(part))
          .filter((part): part is ChatMessagePart => part != null),
      };
    })
    .filter((message) => message.parts.length > 0);
  const displayedChatMessages = [...chatMessages, ...localActionMessages];
  const lastAssistantMessageId =
    [...displayedChatMessages].reverse().find((message) => message.role === 'assistant')?.id ??
    null;

  // AI grading is available only if the question uses manual grading.
  const isAiGradingAvailable = (assessmentQuestion.max_manual_points ?? 0) > 0;

  const mutations = useManualGradingActions();
  const { setAiGradingModeMutation, groupSubmissionMutation } = mutations;

  const rejectProposedRubricChanges = () => {
    setRubricDataState(committedRubricDataState);
    setAiRubricItemDiffsState({});
    postDeterministicActionMessage('Rejected proposed rubric changes. Reverted to saved rubric.');
  };

  const applyProposedRubricChanges = async () => {
    if (rubricDataState == null) return;

    setIsApplyingProposedChanges(true);
    try {
      const rubricItems = rubricDataState.rubric_items.flatMap((item, index) => {
        const diff = aiRubricItemDiffsState[index];
        if (diff?.status === 'removed') {
          return [];
        }

        return [
          {
            id: diff?.status === 'new' ? undefined : item.rubric_item.id,
            order: index,
            points: item.rubric_item.points,
            description: item.rubric_item.description,
            explanation: item.rubric_item.explanation,
            grader_note: item.rubric_item.grader_note,
            always_show_to_students: item.rubric_item.always_show_to_students,
          },
        ];
      });

      const res = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __csrf_token: csrfToken,
          __action: 'modify_rubric_settings',
          use_rubric: true,
          replace_auto_points: rubricDataState.rubric.replace_auto_points,
          starting_points: rubricDataState.rubric.starting_points,
          min_points: rubricDataState.rubric.min_points,
          max_extra_points: rubricDataState.rubric.max_extra_points,
          rubric_items: rubricItems,
          tag_for_manual_grading: false,
          grader_guidelines: rubricDataState.rubric.grader_guidelines,
        }),
      });
      if (!res.ok) {
        postDeterministicActionMessage(
          'Failed to approve proposed rubric changes. Saved rubric was not updated.',
        );
        return;
      }

      const refreshedRes = await fetch(rubricDataUrl, {
        headers: { 'X-CSRF-Token': chatCsrfToken },
      });
      if (!refreshedRes.ok) {
        postDeterministicActionMessage(
          'Failed to refresh rubric after approval. Please reload to verify saved changes.',
        );
        return;
      }

      const refreshedData = (await refreshedRes.json()) as {
        rubric_data: unknown;
        aiGradingStats: AiGradingGeneralStats | null;
      };
      const parsedRubricData = parseRubricData(refreshedData.rubric_data);
      setRubricDataState(parsedRubricData);
      setCommittedRubricDataState(parsedRubricData);
      setAiRubricItemDiffsState({});
      setAiGradingStatsState(refreshedData.aiGradingStats);
      postDeterministicActionMessage('Approved proposed rubric changes and saved to the rubric.');
    } finally {
      setIsApplyingProposedChanges(false);
    }
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
          aiRubricItemDiffs={aiRubricItemDiffsState}
          instanceQuestionGroups={instanceQuestionGroups}
          courseStaff={courseStaff}
          aiGradingStats={aiGradingStatsState}
          disableRubricEditor={isGenerating}
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
      <div className="d-flex flex-column bg-light border rounded" style={{ width: 480 }}>
        <div className="flex-grow-1 overflow-auto p-3">
          <Messages
            messages={displayedChatMessages}
            showWaitingIndicator={isGenerating}
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
                    {hasPendingRubricProposals && (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          disabled={isApplyingProposedChanges || isGenerating}
                          onClick={rejectProposedRubricChanges}
                        >
                          Reject changes
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={isApplyingProposedChanges || isGenerating}
                          onClick={() => {
                            void applyProposedRubricChanges();
                          }}
                        >
                          Approve changes
                        </button>
                      </>
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
          {hasGeneratedRubric && !hasPendingRubricProposals && (
            <div className="small text-muted mb-2">
              You can give suggestions in chat, or start AI grading.
            </div>
          )}
          {hasPendingRubricProposals && (
            <>
              <div className="small text-muted mb-2">
                Proposed rubric changes are shown in the rubric editor. You can approve, reject, or
                ask for more changes.
              </div>
              <div className="d-flex justify-content-end gap-2 mb-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={isApplyingProposedChanges || isGenerating}
                  onClick={rejectProposedRubricChanges}
                >
                  Reject changes
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={isApplyingProposedChanges || isGenerating}
                  onClick={() => {
                    void applyProposedRubricChanges();
                  }}
                >
                  Approve changes
                </button>
              </div>
            </>
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
