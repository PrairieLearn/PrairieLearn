import { useChat } from '@ai-sdk/react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type ToolUIPart, type UIMessage } from 'ai';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import { type Socket, io } from 'socket.io-client';

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
import { type ProgressUpdateMessage } from '../../../lib/serverJobProgressSocket.shared.js';
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
  'tool-revertRubric': {
    streaming: 'Reverting rubric...',
    pending: 'Reverting rubric...',
    done: 'Reverted rubric',
    error: 'Error reverting rubric',
  },
  'tool-startAiGrading': {
    streaming: 'Running AI grading...',
    pending: 'Running AI grading...',
    done: 'AI grading complete',
    error: 'Error running AI grading',
  },
};

// ---------------------------------------------------------------------------
// Rubric diff computation and rendering
// ---------------------------------------------------------------------------

interface DiffRubricItem {
  rubric_item_id: string;
  display_index: number;
  points: number;
  description: string;
  explanation: string | null;
  grader_note: string | null;
  always_show_to_students: boolean;
}

interface DiffRubricState {
  settings: Record<string, unknown> | null;
  rubric_items: DiffRubricItem[];
}

interface FieldChange {
  field: string;
  before: string;
  after: string;
}

interface ItemDiffEntry {
  kind: 'added' | 'removed' | 'edited';
  index: number;
  description: string;
  points: number;
  fieldChanges: FieldChange[];
}

interface RubricDiffResult {
  items: ItemDiffEntry[];
  settingsChanges: FieldChange[];
}

const MUTATION_TOOL_TYPES = new Set([
  'tool-generateRubric',
  'tool-addRubricItem',
  'tool-editRubricItem',
  'tool-deleteRubricItem',
  'tool-swapRubricItems',
  'tool-editRubricSettings',
  'tool-revertRubric',
]);

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const SETTINGS_LABELS: Record<string, string> = {
  starting_points: 'Starting points',
  min_points: 'Min points',
  max_extra_points: 'Max extra credit',
  replace_auto_points: 'Replace auto points',
  grader_guidelines: 'Grader guidelines',
};

const ITEM_FIELD_LABELS: Record<string, string> = {
  points: 'Points',
  description: 'Description',
  explanation: 'Explanation',
  grader_note: 'Grader note',
  always_show_to_students: 'Show to students',
  display_index: 'Position',
};

function diffItemFields(before: DiffRubricItem, after: DiffRubricItem): FieldChange[] {
  const changes: FieldChange[] = [];
  const fields: (keyof DiffRubricItem)[] = [
    'points',
    'description',
    'explanation',
    'grader_note',
    'always_show_to_students',
    'display_index',
  ];
  for (const f of fields) {
    const bVal = before[f];
    const aVal = after[f];
    if (f === 'display_index') {
      if (bVal !== aVal) {
        changes.push({
          field: ITEM_FIELD_LABELS[f],
          before: `#${bVal}`,
          after: `#${aVal}`,
        });
      }
    } else if (displayValue(bVal) !== displayValue(aVal)) {
      changes.push({
        field: ITEM_FIELD_LABELS[f] ?? f,
        before: displayValue(bVal),
        after: displayValue(aVal),
      });
    }
  }
  return changes;
}

function computeRubricDiff(before: DiffRubricState, after: DiffRubricState): RubricDiffResult {
  const beforeIds = new Set(before.rubric_items.map((i) => i.rubric_item_id));
  const afterIds = new Set(after.rubric_items.map((i) => i.rubric_item_id));
  const beforeById = new Map(before.rubric_items.map((i) => [i.rubric_item_id, i]));

  const items: ItemDiffEntry[] = [];

  // Added items
  for (const item of after.rubric_items) {
    if (!beforeIds.has(item.rubric_item_id)) {
      items.push({
        kind: 'added',
        index: item.display_index,
        description: item.description,
        points: item.points,
        fieldChanges: [],
      });
    }
  }

  // Removed items
  for (const item of before.rubric_items) {
    if (!afterIds.has(item.rubric_item_id)) {
      items.push({
        kind: 'removed',
        index: item.display_index,
        description: item.description,
        points: item.points,
        fieldChanges: [],
      });
    }
  }

  // Edited items
  for (const afterItem of after.rubric_items) {
    const beforeItem = beforeById.get(afterItem.rubric_item_id);
    if (!beforeItem) continue;
    const fieldChanges = diffItemFields(beforeItem, afterItem);
    if (fieldChanges.length > 0) {
      items.push({
        kind: 'edited',
        index: afterItem.display_index,
        description: afterItem.description,
        points: afterItem.points,
        fieldChanges,
      });
    }
  }

  // Sort by index for consistent display
  items.sort((a, b) => a.index - b.index);

  const settingsChanges: FieldChange[] = [];
  if (before.settings && after.settings) {
    for (const [key, label] of Object.entries(SETTINGS_LABELS)) {
      const bVal = before.settings[key];
      const aVal = after.settings[key];
      if (displayValue(bVal) !== displayValue(aVal)) {
        settingsChanges.push({
          field: label,
          before: displayValue(bVal),
          after: displayValue(aVal),
        });
      }
    }
  }

  return { items, settingsChanges };
}

function FieldChangeLine({ change }: { change: FieldChange }) {
  return (
    <div className="d-flex flex-column" style={{ fontSize: '0.8rem', lineHeight: 1.3 }}>
      <span className="text-body-secondary fw-semibold" style={{ fontSize: '0.7rem' }}>
        {change.field}
      </span>
      <div className="d-flex flex-column gap-0">
        {change.before !== '(empty)' && (
          <span
            className="text-danger"
            style={{ textDecoration: 'line-through', opacity: 0.7, wordBreak: 'break-word' }}
          >
            {change.before}
          </span>
        )}
        {change.after !== '(empty)' && (
          <span className="text-success" style={{ wordBreak: 'break-word' }}>
            {change.after}
          </span>
        )}
        {change.before !== '(empty)' && change.after === '(empty)' && (
          <span className="text-body-secondary fst-italic">removed</span>
        )}
      </div>
    </div>
  );
}

function RubricDiff({ diff }: { diff: RubricDiffResult }) {
  const hasChanges = diff.items.length > 0 || diff.settingsChanges.length > 0;
  if (!hasChanges) return null;

  const borderColor = (kind: ItemDiffEntry['kind']) => {
    switch (kind) {
      case 'added':
        return '#198754';
      case 'removed':
        return '#dc3545';
      case 'edited':
        return '#0d6efd';
    }
  };

  const bgColor = (kind: ItemDiffEntry['kind']) => {
    switch (kind) {
      case 'added':
        return 'rgba(25, 135, 84, 0.05)';
      case 'removed':
        return 'rgba(220, 53, 69, 0.05)';
      case 'edited':
        return 'rgba(13, 110, 253, 0.05)';
    }
  };

  const kindLabel = (kind: ItemDiffEntry['kind']) => {
    switch (kind) {
      case 'added':
        return 'Added';
      case 'removed':
        return 'Removed';
      case 'edited':
        return 'Edited';
    }
  };

  const kindIcon = (kind: ItemDiffEntry['kind']) => {
    switch (kind) {
      case 'added':
        return 'bi-plus-circle-fill';
      case 'removed':
        return 'bi-dash-circle-fill';
      case 'edited':
        return 'bi-pencil-fill';
    }
  };

  return (
    <div className="mt-2 mb-1 d-flex flex-column gap-1" style={{ fontSize: '0.85rem' }}>
      <div className="fw-semibold text-body-secondary" style={{ fontSize: '0.75rem' }}>
        Changes
      </div>
      {diff.items.map((item) => (
        <div
          key={`${item.kind}-${item.index}-${item.description}`}
          className="rounded px-2 py-1"
          style={{
            borderLeft: `3px solid ${borderColor(item.kind)}`,
            background: bgColor(item.kind),
          }}
        >
          <div className="d-flex align-items-start gap-1 flex-wrap">
            <div className="d-flex align-items-center gap-1 flex-shrink-0">
              <i
                className={`bi ${kindIcon(item.kind)}`}
                style={{ color: borderColor(item.kind), fontSize: '0.7rem' }}
                aria-hidden="true"
              />
              <span
                className="fw-semibold"
                style={{ color: borderColor(item.kind), fontSize: '0.7rem' }}
              >
                {kindLabel(item.kind)}
              </span>
              <span
                className="badge rounded-pill bg-light text-dark border"
                style={{ fontSize: '0.65rem' }}
              >
                {item.index}
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', wordBreak: 'break-word', minWidth: 0 }}>
              {item.description}
              {(item.kind === 'added' || item.kind === 'removed') && (
                <span className="text-body-secondary ms-1" style={{ fontSize: '0.75rem' }}>
                  ({item.points > 0 ? '+' : ''}
                  {item.points} pts)
                </span>
              )}
            </span>
          </div>
          {item.fieldChanges.length > 0 && (
            <div className="d-flex flex-column gap-1 mt-1 ps-3">
              {item.fieldChanges.map((change) => (
                <FieldChangeLine key={change.field} change={change} />
              ))}
            </div>
          )}
        </div>
      ))}
      {diff.settingsChanges.length > 0 && (
        <div
          className="rounded px-2 py-1"
          style={{
            borderLeft: '3px solid #6c757d',
            background: 'rgba(108, 117, 125, 0.05)',
          }}
        >
          <div className="d-flex align-items-center gap-1 mb-1">
            <i
              className="bi bi-gear-fill"
              style={{ color: '#6c757d', fontSize: '0.7rem' }}
              aria-hidden="true"
            />
            <span className="fw-semibold" style={{ color: '#6c757d', fontSize: '0.7rem' }}>
              Settings
            </span>
          </div>
          <div className="d-flex flex-column gap-1 ps-3">
            {diff.settingsChanges.map((change) => (
              <FieldChangeLine key={change.field} change={change} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

/**
 * Inline grading progress indicator displayed in the chat when AI grading is running.
 * Connects to the server job progress socket to show real-time status.
 */
function InlineGradingProgress({
  jobSequenceId,
  jobSequenceToken,
  onComplete,
}: {
  jobSequenceId: string;
  jobSequenceToken: string;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState<{
    numComplete: number;
    numFailed: number;
    numTotal: number;
    failureMessage?: string;
  } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const socket = io('/server-job-progress');
    socketRef.current = socket;

    // If no progress data arrives within 5 seconds, assume the job already
    // finished (e.g. viewing a past conversation). Show a static completed state.
    const timeout = window.setTimeout(() => {
      setTimedOut(true);
    }, 5000);

    socket.emit(
      'joinServerJobProgress',
      {
        job_sequence_id: jobSequenceId,
        job_sequence_token: jobSequenceToken,
      },
      (response: ProgressUpdateMessage) => {
        clearTimeout(timeout);
        if (!response.has_progress_data) {
          setTimedOut(true);
          return;
        }
        setProgress({
          numComplete: response.num_complete,
          numFailed: response.num_failed,
          numTotal: response.num_total,
          failureMessage: response.job_failure_message,
        });
        if (response.num_complete >= response.num_total) {
          onCompleteRef.current();
        }
      },
    );

    socket.on('serverJobProgressUpdate', (msg: ProgressUpdateMessage) => {
      if (msg.job_sequence_id !== jobSequenceId || !msg.has_progress_data) return;
      clearTimeout(timeout);
      setProgress({
        numComplete: msg.num_complete,
        numFailed: msg.num_failed,
        numTotal: msg.num_total,
        failureMessage: msg.job_failure_message,
      });
      if (msg.num_complete >= msg.num_total) {
        onCompleteRef.current();
      }
    });

    return () => {
      clearTimeout(timeout);
      socket.disconnect();
    };
  }, [jobSequenceId, jobSequenceToken]);

  // If timed out with no progress data, show a static completed state
  if (!progress && timedOut) {
    return (
      <div className="d-flex align-items-center gap-2 py-2">
        <i className="bi bi-check-circle-fill text-success" />
        <span className="small fw-medium text-muted">AI grading completed</span>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="d-flex align-items-center gap-2 py-2">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="text-muted small">Starting AI grading...</span>
      </div>
    );
  }

  const isComplete = progress.numComplete >= progress.numTotal;
  const numSucceeded = progress.numComplete - progress.numFailed;
  const progressPercent =
    progress.numTotal > 0 ? Math.round((progress.numComplete / progress.numTotal) * 100) : 0;

  return (
    <div className="py-2">
      <div className="d-flex align-items-center gap-2 mb-1">
        {!isComplete && (
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        )}
        {isComplete && <i className="bi bi-check-circle-fill text-success" />}
        <span className="small fw-medium">
          {isComplete
            ? `AI grading complete: ${numSucceeded} graded${progress.numFailed > 0 ? `, ${progress.numFailed} failed` : ''}`
            : `Grading ${progress.numComplete}/${progress.numTotal} submissions...`}
        </span>
      </div>
      <div className="progress" style={{ height: '6px' }}>
        <div
          className={`progress-bar ${progress.numFailed > 0 ? 'bg-warning' : 'bg-success'}`}
          role="progressbar"
          style={{ width: `${progressPercent}%` }}
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {progress.failureMessage && (
        <div className="text-danger small mt-1">{progress.failureMessage}</div>
      )}
    </div>
  );
}

/**
 * Compute a master diff across all mutation tool calls in a single message.
 * Uses the `before` snapshot from the first mutation and `after` from the last.
 */
function MasterRubricDiff({
  parts,
  isComplete,
}: {
  parts: UIMessage['parts'];
  isComplete: boolean;
}) {
  if (!isComplete) return null;

  const diff = run(() => {
    const mutationParts = parts.filter(
      (p): p is ToolUIPart =>
        isToolPart(p) && p.state === 'output-available' && MUTATION_TOOL_TYPES.has(p.type),
    );
    if (mutationParts.length === 0) return null;

    let firstBefore: DiffRubricState | null = null;
    let lastAfter: DiffRubricState | null = null;

    for (const part of mutationParts) {
      try {
        const raw = part.output;
        if (!raw) continue;
        const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
          before?: DiffRubricState;
          after?: DiffRubricState;
        };
        if (parsed.before && !firstBefore) {
          firstBefore = parsed.before;
        }
        if (parsed.after) {
          lastAfter = parsed.after;
        }
      } catch {
        continue;
      }
    }

    if (!firstBefore || !lastAfter) return null;
    const result = computeRubricDiff(firstBefore, lastAfter);
    const hasChanges = result.items.length > 0 || result.settingsChanges.length > 0;
    return hasChanges ? result : null;
  });

  if (!diff) return null;
  return <RubricDiff diff={diff} />;
}

function MessageParts({
  parts,
  onGradingComplete,
}: {
  parts: UIMessage['parts'];
  onGradingComplete?: () => void;
}) {
  return (
    <>
      {parts.map((part, index) => {
        const key = `part-${index}`;
        if (isToolPart(part)) {
          // For startAiGrading tool, render inline progress instead of simple status
          if (
            part.type === 'tool-startAiGrading' &&
            part.state === 'output-available' &&
            onGradingComplete
          ) {
            try {
              const raw = (part as ToolUIPart & { output?: unknown }).output;
              const parsed =
                typeof raw === 'string'
                  ? JSON.parse(raw)
                  : (raw as Record<string, unknown> | undefined);
              if (parsed?.job_sequence_id && parsed?.job_sequence_token) {
                return (
                  <div key={key}>
                    <ToolCall part={part} />
                    <InlineGradingProgress
                      jobSequenceId={parsed.job_sequence_id as string}
                      jobSequenceToken={parsed.job_sequence_token as string}
                      onComplete={onGradingComplete}
                    />
                  </div>
                );
              }
            } catch {
              // Fall through to default rendering
            }
          }
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

function hasMutations(parts: UIMessage['parts']): boolean {
  return parts.some(
    (p) => isToolPart(p) && MUTATION_TOOL_TYPES.has(p.type) && p.state === 'output-available',
  );
}

/**
 * Given a snapshot ID prefix (e.g. "abc12345"), find the matching message
 * and extract the `before` snapshot from its first mutation tool output.
 * This is used to inject snapshot data when the user asks to revert.
 */
function findSnapshotForRevert(
  allMessages: RubricChatMessage[],
  messageText: string,
): { snapshotJson: string; snapshotId: string } | null {
  // Match patterns like "snapshot abc12345" or "revert abc12345" (case-insensitive)
  const match = messageText.match(
    /(?:snapshot|revert\s+(?:to\s+)?(?:snapshot\s+)?)([a-f0-9]{6,})/i,
  );
  if (!match) return null;
  const prefix = match[1];

  // Find the message whose ID starts with the given prefix
  const targetMessage = allMessages.find(
    (m) => m.role === 'assistant' && m.id.startsWith(prefix) && hasMutations(m.parts),
  );
  if (!targetMessage) return null;

  // Extract the after snapshot from the last mutation tool output
  for (const part of [...targetMessage.parts].reverse()) {
    if (
      !isToolPart(part) ||
      !MUTATION_TOOL_TYPES.has(part.type) ||
      part.state !== 'output-available'
    ) {
      continue;
    }
    try {
      const raw = (part as ToolUIPart & { output?: unknown }).output;
      if (!raw) continue;
      const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        after?: DiffRubricState;
      };
      if (parsed.after) {
        return {
          snapshotJson: JSON.stringify(parsed.after),
          snapshotId: targetMessage.id.slice(0, 8),
        };
      }
    } catch {
      continue;
    }
  }
  return null;
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
  const isGradingInProgressRef = useRef(false);
  const addOngoingJobSequenceRef = useRef<
    ((jobSequenceId: string, jobSequenceToken: string) => void) | null
  >(null);

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

  const refreshRubricData = useCallback(() => {
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
  }, [rubricDataUrl, chatCsrfToken]);

  const { messages, setMessages, sendMessage, status } = useChat<RubricChatMessage>({
    messages: persistedMessagesToInitialMessages(initialChatMessages),
    transport: new DefaultChatTransport({
      api: chatUrl,
      headers: { 'X-CSRF-Token': chatCsrfToken },
      prepareSendMessagesRequest: ({ messages: chatMsgs, headers, body }) => {
        const lastMessage = chatMsgs[chatMsgs.length - 1];
        let messageText =
          lastMessage.role === 'user'
            ? (lastMessage.parts as { type: string; text?: string }[])
                .map((p) => (p.type === 'text' ? (p.text ?? '') : ''))
                .filter(Boolean)
                .join('\n\n')
            : '';

        // If the user references a snapshot ID, inject the snapshot data
        // so the agent can call revertRubric with the full state.
        const snapshotMatch = findSnapshotForRevert(messages, messageText);
        if (snapshotMatch) {
          messageText += `\n\n[Revert to snapshot ${snapshotMatch.snapshotId}]\nSnapshot data:\n${snapshotMatch.snapshotJson}`;
          currentPhaseRef.current = 'edit';
        }

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
          // Don't scroll to rubric while grading is in progress
          if (!isGradingInProgressRef.current) {
            triggerOpenRubricEditor();
          }
          refreshRubricData();

          void queryClient.invalidateQueries({
            queryKey: trpc.instances.queryKey(),
          });
        }
      }
    },
  });

  const isGenerating = status === 'streaming' || status === 'submitted';

  const handleGradingComplete = useCallback(() => {
    setIsGradingInProgress(false);
    isGradingInProgressRef.current = false;
    refreshRubricData();
    void queryClient.invalidateQueries({
      queryKey: trpc.instances.queryKey(),
    });
  }, [queryClient, trpc.instances, refreshRubricData]);

  // Scan messages for startAiGrading tool outputs and register them with
  // the table's server job progress tracker so the standard progress bar appears.
  const registeredJobSequencesRef = useRef(new Set<string>());
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          isToolPart(part) &&
          part.type === 'tool-startAiGrading' &&
          part.state === 'output-available'
        ) {
          try {
            const raw = (part as ToolUIPart & { output?: unknown }).output;
            const parsed =
              typeof raw === 'string'
                ? JSON.parse(raw)
                : (raw as Record<string, unknown> | undefined);
            if (
              parsed?.job_sequence_id &&
              parsed?.job_sequence_token &&
              !registeredJobSequencesRef.current.has(parsed.job_sequence_id as string)
            ) {
              registeredJobSequencesRef.current.add(parsed.job_sequence_id as string);
              addOngoingJobSequenceRef.current?.(
                parsed.job_sequence_id as string,
                parsed.job_sequence_token as string,
              );
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }, [messages]);

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
          aiGradingMode={aiGradingMode || isGradingInProgress}
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
          onServerJobProgressRef={addOngoingJobSequenceRef}
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

              // Check if this is a revert message containing a JSON snapshot
              const revertMatch = textContent.match(/^\[revert:([a-f0-9]+)\]/);

              return (
                <div key={message.id} className="d-flex flex-row-reverse mb-3">
                  <div
                    className="d-flex flex-column gap-2 p-3 rounded bg-secondary-subtle"
                    style={{ maxWidth: '90%', whiteSpace: 'pre-wrap' }}
                  >
                    {revertMatch ? (
                      <>
                        <span>Revert rubric to a previous state</span>
                        <div
                          className="d-flex align-items-center gap-2 rounded border px-2 py-1"
                          style={{
                            background: 'rgba(13, 110, 253, 0.06)',
                            borderColor: 'rgba(13, 110, 253, 0.25)',
                            fontSize: '0.8rem',
                            color: '#495057',
                          }}
                        >
                          <i
                            className="bi bi-bookmark-fill"
                            style={{ color: '#0d6efd', fontSize: '0.7rem' }}
                            aria-hidden="true"
                          />
                          <span>
                            Rubric from message{' '}
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {revertMatch[1]}
                            </span>
                          </span>
                        </div>
                      </>
                    ) : (
                      textContent
                    )}
                  </div>
                </div>
              );
            }

            const isMessageComplete =
              message.metadata?.status === 'completed' ||
              message.metadata?.status === 'errored' ||
              !isGenerating;

            return (
              <div key={message.id} className="d-flex flex-column gap-1 mb-3">
                <MessageParts parts={message.parts} onGradingComplete={handleGradingComplete} />
                <MasterRubricDiff parts={message.parts} isComplete={isMessageComplete} />
                {isMessageComplete && hasMutations(message.parts) && (
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-muted"
                      disabled={isGenerating}
                      title="Restore rubric to the state after this message"
                      onClick={() => {
                        // Extract the after snapshot from the last mutation tool output.
                        // This restores the rubric to the state after this message completed.
                        // The output may be a JSON string or an already-parsed object
                        // depending on whether it came from a live stream or persisted data.
                        let afterSnapshot: DiffRubricState | null = null;
                        for (const part of [...message.parts].reverse()) {
                          if (
                            !isToolPart(part) ||
                            !MUTATION_TOOL_TYPES.has(part.type) ||
                            part.state !== 'output-available'
                          ) {
                            continue;
                          }
                          try {
                            const raw = (part as ToolUIPart & { output?: unknown }).output;
                            if (!raw) continue;
                            const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
                              after?: DiffRubricState;
                            };
                            if (parsed.after) {
                              afterSnapshot = parsed.after;
                              break;
                            }
                          } catch {
                            continue;
                          }
                        }
                        if (!afterSnapshot) return;

                        currentPhaseRef.current = 'edit';
                        const snapshotId = message.id.slice(0, 8);
                        void sendMessage({
                          text: `[revert:${snapshotId}] Revert the rubric to this snapshot:\n${JSON.stringify(afterSnapshot)}`,
                        });
                      }}
                    >
                      <i className="bi bi-arrow-counterclockwise me-1" />
                      Revert
                    </button>
                    <span
                      className="text-muted user-select-all"
                      style={{ fontSize: '0.6rem', fontFamily: 'monospace', opacity: 0.5 }}
                    >
                      {message.id.slice(0, 8)}
                    </span>
                  </div>
                )}
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
                disabled={isGradingInProgress || isGenerating}
                onClick={() => {
                  setIsGradingInProgress(true);
                  isGradingInProgressRef.current = true;
                  currentPhaseRef.current = 'edit';
                  void sendMessage({ text: 'Start AI grading' });
                }}
              >
                {isGradingInProgress ? (
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
            disabled={!hasGeneratedRubric || isGradingInProgress}
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
