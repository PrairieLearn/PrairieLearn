import { useChat } from '@ai-sdk/react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type ToolUIPart, type UIMessage } from 'ai';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Overlay, Popover } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { NuqsAdapter, OverlayTrigger } from '@prairielearn/ui';

import { MemoizedMarkdown } from '../../../components/MemoizedMarkdown.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { mathjaxTypeset } from '../../../lib/client/mathjax.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import {
  type StaffAiGradingMessage,
  StaffAiGradingMessageSchema,
  type StaffAssessment,
  type StaffAssessmentQuestion,
  type StaffInstanceQuestionGroup,
  type StaffUser,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
import { type RubricData, RubricDataSchema } from '../../../lib/manualGrading.types.js';
import { createAssessmentQuestionTrpcClient } from '../../../trpc/assessmentQuestion/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/assessmentQuestion/context.js';
import type { ManualGradingError } from '../../../trpc/assessmentQuestion/manual-grading.js';

import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';
import { AiGradingUnavailableModal } from './components/AiGradingUnavailableModal.js';
import { AssessmentQuestionTable } from './components/AssessmentQuestionTable.js';
import {
  type ConflictModalState,
  GradingConflictModal,
} from './components/GradingConflictModal.js';
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
  aiSubmissionGroupingEnabled: boolean;
  initialAiGradingMode: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  courseStaff: StaffUser[];
  aiGradingStats: AiGradingGeneralStats | null;
  numOpenInstances: number;
  search: string;
  isDevMode: boolean;
  questionTitle: string;
  questionNumber: number;
  availableAiGradingProviders: EnumAiGradingProvider[];
  aiRubricAgentEnabled: boolean;
  chatCsrfToken: string;
  initialChatMessages: StaffAiGradingMessage[];
  initialWorkflowSync: { workflowRunId: string | null; version: number } | null;
  aiGradingRelativeCosts: Record<string, string>;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
}

type AssessmentQuestionManualGradingInnerProps = Omit<
  AssessmentQuestionManualGradingProps,
  'search' | 'isDevMode' | 'trpcCsrfToken'
>;

type RubricPhase = 'generate' | 'edit';

type RubricChatMessage = UIMessage<{
  workflow_run_id?: string;
  workflow_version?: number;
  status?: 'streaming' | 'completed' | 'errored' | 'canceled';
  phase?: RubricPhase;
  rubric_modified?: boolean;
}>;

// ---------------------------------------------------------------------------
// Polling hook – runs `fn` on an interval while `active` is true.
// ---------------------------------------------------------------------------

function usePollWhileActive(
  active: boolean,
  fn: () => Promise<void>,
  intervalMs: number,
  initialDelayMs?: number,
) {
  const inFlightRef = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!active) return;

    let canceled = false;
    const poll = async () => {
      if (canceled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await fnRef.current();
      } catch {
        // Best-effort; keep retrying on next interval tick.
      }
      inFlightRef.current = false;
    };

    const timeoutId =
      initialDelayMs != null ? window.setTimeout(() => void poll(), initialDelayMs) : undefined;
    if (initialDelayMs == null) void poll();

    const intervalId = window.setInterval(() => void poll(), intervalMs);
    return () => {
      canceled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [active, intervalMs, initialDelayMs]);
}

// ---------------------------------------------------------------------------
// Tool call rendering
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
          <div
            className="spinner-grow spinner-grow-sm text-secondary"
            role="status"
            style={{ width: '0.5rem', height: '0.5rem' }}
          >
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

function RubricDiff({ diff, actionSlot }: { diff: RubricDiffResult; actionSlot?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

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

  const changeCount = diff.items.length + diff.settingsChanges.length;

  return (
    <div className="mt-1 mb-1 rounded border" style={{ fontSize: '0.85rem' }}>
      <div
        className="d-flex align-items-center px-2 py-1"
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((s) => !s);
          }
        }}
      >
        <div className="d-flex align-items-center gap-1 text-muted" style={{ fontSize: '0.85rem' }}>
          <i
            className={`bi bi-chevron-${expanded ? 'down' : 'right'}`}
            style={{ fontSize: '0.65rem' }}
          />
          {changeCount} change{changeCount !== 1 ? 's' : ''}
        </div>
        {actionSlot && <div className="ms-auto">{actionSlot}</div>}
      </div>
      {!expanded ? null : (
        <div className="d-flex flex-column gap-1 px-2 pb-2">
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
      )}
    </div>
  );
}

function ToolCall({ part }: { part: ToolUIPart }) {
  // Only show completed/errored tool calls — the "Working..." indicator
  // handles the in-progress state to avoid duplicate loading indicators.
  if (part.state !== 'output-available' && part.state !== 'output-error') {
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

function MasterRubricDiff({
  parts,
  isComplete,
  actionSlot,
}: {
  parts: UIMessage['parts'];
  isComplete: boolean;
  actionSlot?: ReactNode;
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
  return <RubricDiff diff={diff} actionSlot={actionSlot} />;
}

function MessageParts({
  parts,
  isStreaming,
}: {
  parts: UIMessage['parts'];
  isStreaming?: boolean;
}) {
  // Show "Working..." whenever streaming and the last part isn't actively producing text.
  // Text parts stream character-by-character so they're their own indicator.
  const lastPart = [...parts].reverse().find((p) => (p.type === 'text' && p.text) || isToolPart(p));
  const isActivelyStreamingText = lastPart?.type === 'text' && lastPart.text;
  const isWorking = isStreaming && !isActivelyStreamingText;

  return (
    <>
      {parts.map((part, index) => {
        const key = `part-${index}`;
        if (isToolPart(part)) {
          return <ToolCall key={key} part={part} />;
        } else if (part.type === 'text') {
          if (!part.text) return null;
          return (
            <div key={key} className="markdown-body">
              <MemoizedMarkdown content={part.text} />
            </div>
          );
        } else if (part.type === 'step-start') {
          return null;
        }
        return null;
      })}
      {isWorking && (
        <div className="d-flex align-items-center gap-2 small text-muted mt-1">
          <div
            className="spinner-grow spinner-grow-sm text-secondary"
            role="status"
            style={{ width: '0.5rem', height: '0.5rem' }}
          >
            <span className="visually-hidden">Working...</span>
          </div>
          Working...
        </div>
      )}
    </>
  );
}

function scrollToRubricEditor() {
  const rubricEditorElement = document.getElementById('rubric-editor');
  if (!rubricEditorElement) return;

  rubricEditorElement.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function RevertButton({
  label,
  disabled,
  onConfirm,
}: {
  label: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [show, setShow] = useState(false);
  const targetRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {disabled ? (
        <span
          className="btn btn-link btn-sm p-0 text-muted disabled"
          style={{ pointerEvents: 'none', opacity: 0.5, textDecoration: 'none' }}
        >
          <i className="bi bi-arrow-counterclockwise me-1" />
          {label}
        </span>
      ) : (
        <button
          ref={targetRef}
          type="button"
          className="btn btn-link btn-sm p-0 text-muted"
          onClick={(e) => {
            e.stopPropagation();
            setShow((s) => !s);
          }}
        >
          <i className="bi bi-arrow-counterclockwise me-1" />
          {label}
        </button>
      )}
      <Overlay
        target={targetRef.current}
        show={show}
        placement="top-start"
        rootClose
        onHide={() => setShow(false)}
      >
        {(props) => (
          <Popover {...props}>
            <Popover.Header as="h6">Revert rubric</Popover.Header>
            <Popover.Body style={{ width: 280 }}>
              <p className="small text-body-secondary mb-2">
                This will restore the rubric to this earlier state. You can always revert again to
                return to the current rubric.
              </p>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShow(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setShow(false);
                    onConfirm();
                  }}
                >
                  Revert rubric
                </button>
              </div>
            </Popover.Body>
          </Popover>
        )}
      </Overlay>
    </>
  );
}

function hasMutations(parts: UIMessage['parts']): boolean {
  return parts.some(
    (p) => isToolPart(p) && MUTATION_TOOL_TYPES.has(p.type) && p.state === 'output-available',
  );
}

function persistedMessagesToInitialMessages(
  persistedMessages: StaffAiGradingMessage[],
): RubricChatMessage[] {
  return persistedMessages
    .filter((m) => m.status === 'completed' || m.status === 'streaming' || m.status === 'canceled')
    .map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts.map((part: Record<string, unknown>) => {
        if (part.type === 'text') {
          return { type: 'text' as const, text: (part.text as string | undefined) ?? '' };
        }
        return part as UIMessage['parts'][0];
      }),
      metadata: {
        workflow_run_id: m.workflow_run_id ?? undefined,
        status: m.status as 'streaming' | 'completed' | 'errored',
        phase: m.phase,
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
  aiSubmissionGroupingEnabled,
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
  aiRubricAgentEnabled,
  chatCsrfToken,
  initialChatMessages,
  initialWorkflowSync,
  aiGradingRelativeCosts,
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

  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);
  const [chatInput, setChatInput] = useState('');
  const currentPhaseRef = useRef<RubricPhase>('generate');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  // Track workflow run ID and version for consistency checks.
  // Updated from SSE metadata when agent responses complete.
  const workflowSyncRef = useRef(initialWorkflowSync);

  const [conflictError, setConflictError] = useState<string | null>(() => {
    return null;
  });

  const chatUrl = `${urlPrefix}/assessment/${assessment.id}/manual_grading/assessment_question/${assessmentQuestion.id}/chat`;
  const chatMessagesUrl = `${chatUrl}/messages`;
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
        const newRubricData = RubricDataSchema.nullable().parse(data.rubric_data);
        setRubricDataState(newRubricData);
        setAiGradingStatsState(data.aiGradingStats);

        // Update hasGeneratedRubric based on whether a rubric exists.
        // This handles the case where the user deletes the rubric.
        if (newRubricData != null) {
          setHasGeneratedRubric(true);
        } else {
          setHasGeneratedRubric(false);
        }
      })
      .catch(() => {});
  }, [rubricDataUrl, chatCsrfToken]);

  const { messages, setMessages, sendMessage, resumeStream, status } = useChat<RubricChatMessage>({
    messages: persistedMessagesToInitialMessages(initialChatMessages),
    resume: true,
    transport: new DefaultChatTransport({
      api: chatUrl,
      headers: { 'X-CSRF-Token': chatCsrfToken },
      async fetch(input, init) {
        const response = await fetch(input, init);
        if (response.status === 409) {
          const data = (await response.json()) as { error?: string };
          setConflictError(
            data.error ?? 'The rubric assistant is out of sync. Please reload to continue.',
          );
          return new Response(null, { status: 204 });
        }
        return response;
      },
      prepareReconnectToStreamRequest: () => ({
        api: `${chatUrl}/stream`,
      }),
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
            workflow_run_id: workflowSyncRef.current?.workflowRunId ?? null,
            workflow_version: workflowSyncRef.current?.version ?? null,
          },
        };
      },
    }),
    onFinish({ message }) {
      // Update workflow sync state from SSE metadata
      if (message.metadata?.workflow_run_id && message.metadata.workflow_version != null) {
        workflowSyncRef.current = {
          workflowRunId: message.metadata.workflow_run_id,
          version: message.metadata.workflow_version,
        };
      }

      const phase = message.metadata?.phase;

      if (phase === 'generate') {
        setHasGeneratedRubric(true);

        refreshRubricData();
        scrollToRubricEditor();

        void queryClient.invalidateQueries({
          queryKey: trpc.manualGrading.instances.queryKey(),
        });
        return;
      }

      if (phase === 'edit') {
        const rubricModified = message.metadata?.rubric_modified ?? false;
        if (rubricModified) {
          setHasGeneratedRubric(true);

          refreshRubricData();
          scrollToRubricEditor();

          void queryClient.invalidateQueries({
            queryKey: trpc.manualGrading.instances.queryKey(),
          });
        }
      }
    },
  });

  const hasStreamingAssistantMessage = messages.some(
    (m) => m.role === 'assistant' && m.metadata?.status === 'streaming',
  );
  const isGenerating =
    status === 'streaming' || status === 'submitted' || hasStreamingAssistantMessage;

  // Reset isStopping when generation ends (render-time adjustment, not useEffect).
  if (!isGenerating && isStopping) {
    setIsStopping(false);
  }

  // Refresh rubric data in real-time as mutation tool calls complete during streaming.
  const completedMutationCountRef = useRef(0);
  /* eslint-disable react-you-might-not-need-an-effect/no-derived-state -- rubricDataState is fetched from the server, not derived from messages */
  useEffect(() => {
    let count = 0;
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          isToolPart(part) &&
          MUTATION_TOOL_TYPES.has(part.type) &&
          part.state === 'output-available'
        ) {
          count++;
        }
      }
    }
    if (count > completedMutationCountRef.current) {
      completedMutationCountRef.current = count;
      refreshRubricData();
    }
  }, [messages, refreshRubricData]);
  /* eslint-enable react-you-might-not-need-an-effect/no-derived-state */

  const refreshChatMessages = useCallback(async () => {
    const response = await fetch(chatMessagesUrl, {
      headers: { 'X-CSRF-Token': chatCsrfToken },
    });
    if (!response.ok) return;
    const data = (await response.json()) as { messages: unknown };
    const serverMessages = StaffAiGradingMessageSchema.array().parse(data.messages);
    setMessages(persistedMessagesToInitialMessages(serverMessages));
  }, [chatCsrfToken, chatMessagesUrl, setMessages]);

  // Poll to reconnect the SSE stream when the client knows a message is still streaming.
  usePollWhileActive(hasStreamingAssistantMessage && status === 'ready', resumeStream, 1000);
  // Also periodically refresh persisted messages so the UI converges if the stream can't reconnect.
  usePollWhileActive(
    hasStreamingAssistantMessage && status === 'ready',
    refreshChatMessages,
    2000,
    1250,
  );

  // Re-run MathJax typesetting and auto-scroll the chat container when messages change.
  // We scroll the container div (overflow-auto), NOT the viewport.
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatContainerRef.current) {
      void mathjaxTypeset([chatContainerRef.current]);
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const isAiGradingAvailable = (assessmentQuestion.max_manual_points ?? 0) > 0;

  const mutations = useManualGradingActions();
  const { setAiGradingModeMutation, groupSubmissionMutation } = mutations;
  const setAiGradingModeError = getAppError<ManualGradingError['SetAiGradingMode']>(
    setAiGradingModeMutation.error,
  );

  const handleClearChat = () => {
    setShowClearConfirm(false);
    void fetch(`${chatUrl}/clear`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': chatCsrfToken },
    }).then(async (response) => {
      if (response.ok) {
        setMessages([]);
        setHasGeneratedRubric(initialRubricData != null);
      } else if (response.status === 409) {
        const data = (await response.json()) as { error?: string };
        setConflictError(
          data.error ??
            'Cannot reset while the rubric assistant is running. Please try again later.',
        );
      }
    });
  };

  return (
    <div className="d-flex flex-column flex-lg-row gap-3">
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <AppErrorAlert
          error={setAiGradingModeError}
          className="mb-3"
          render={{
            UNKNOWN: ({ message }) => (
              <>
                <strong>Error:</strong> {message}
              </>
            ),
          }}
          onDismiss={() => setAiGradingModeMutation.reset()}
        />
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
          aiSubmissionGroupingEnabled={aiSubmissionGroupingEnabled}
          rubricData={rubricDataState}
          instanceQuestionGroups={instanceQuestionGroups}
          courseStaff={courseStaff}
          aiGradingStats={aiGradingStatsState}
          mutations={mutations}
          initialOngoingJobSequenceTokens={initialOngoingJobSequenceTokens}
          availableAiGradingProviders={availableAiGradingProviders}
          aiGradingRelativeCosts={aiGradingRelativeCosts}
          rubricEditingDisabled={isGenerating}
          onSetGroupInfoModalState={setGroupInfoModalState}
          onSetConflictModalState={setConflictModalState}
          onRubricSettingsSaved={({ rubric_data, aiGradingStats: newAiGradingStats }) => {
            setRubricDataState(rubric_data);
            setAiGradingStatsState(newAiGradingStats);
            void queryClient.invalidateQueries({
              queryKey: trpc.manualGrading.instances.queryKey(),
            });
          }}
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
            void queryClient.invalidateQueries({
              queryKey: trpc.manualGrading.instances.queryKey(),
            });
          }}
        />

        <AiGradingUnavailableModal
          show={showAiGradingUnavailableModal}
          onHide={() => setShowAiGradingUnavailableModal(false)}
        />
      </div>

      {aiRubricAgentEnabled && (
        <div
          className="d-flex flex-column border rounded flex-shrink-0 overflow-hidden"
          style={{ width: '100%', maxWidth: 'min(480px, 35vw)', height: '70vh' }}
        >
          <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white">
            <i className="bi bi-stars text-primary" />
            <span className="fw-semibold small flex-grow-1">Rubric assistant</span>
            {messages.length > 0 && hasCourseInstancePermissionEdit && (
              <>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={
                    isGenerating ||
                    !messages.some((m) => m.role === 'assistant' && hasMutations(m.parts))
                  }
                  onClick={() => {
                    const mutationMsgIndices = messages
                      .map((m, i) => (m.role === 'assistant' && hasMutations(m.parts) ? i : -1))
                      .filter((i) => i !== -1);
                    if (mutationMsgIndices.length === 0) return;
                    const targetIndex =
                      mutationMsgIndices.length >= 2
                        ? mutationMsgIndices[mutationMsgIndices.length - 2]
                        : -1;
                    const targetMessageId = targetIndex === -1 ? '0' : messages[targetIndex].id;
                    currentPhaseRef.current = 'edit';
                    void sendMessage({
                      text: `Revert to the rubric from message ID ${targetMessageId}`,
                    });
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={isGenerating}
                  onClick={() => setShowClearConfirm(true)}
                >
                  Reset
                </button>
              </>
            )}
          </div>
          <div ref={chatContainerRef} className="flex-grow-1 overflow-auto p-3 bg-light">
            {messages.length === 0 && !isGenerating && (
              <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center text-muted">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary bg-opacity-10 mb-2"
                  style={{ width: '3rem', height: '3rem' }}
                >
                  <i className="bi bi-stars text-primary" style={{ fontSize: '1.1rem' }} />
                </div>
                <div className="fw-semibold">Rubric assistant</div>
                <div className="small mt-1">
                  {hasGeneratedRubric
                    ? 'Ask the assistant to edit your rubric.'
                    : 'Generate a rubric or describe what you want to the assistant.'}
                </div>
              </div>
            )}
            {messages.map((message, msgIndex) => {
              if (message.role === 'user') {
                const textContent = message.parts
                  .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                  .map((p) => p.text)
                  .filter(Boolean)
                  .join('\n\n');
                if (!textContent) return null;

                const revertMatch = textContent.match(/Revert to the rubric from message ID (\d+)/);

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
                            <span>Reverting to a previous rubric state</span>
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
                message.metadata?.status === 'canceled' ||
                message.metadata?.status == null;

              return (
                <div key={message.id} className="d-flex flex-column gap-1 mb-3">
                  <MessageParts
                    parts={message.parts}
                    isStreaming={
                      isGenerating && !isMessageComplete && msgIndex === messages.length - 1
                    }
                  />
                  {message.metadata?.status === 'canceled' && (
                    <div className="small text-muted fst-italic">
                      <i className="bi bi-stop-circle me-1" aria-hidden="true" />
                      Generation was stopped
                    </div>
                  )}
                  <MasterRubricDiff
                    parts={message.parts}
                    isComplete={isMessageComplete}
                    actionSlot={
                      isMessageComplete && hasMutations(message.parts) ? (
                        <RevertButton
                          label="Revert"
                          disabled={!hasCourseInstancePermissionEdit || isGenerating}
                          onConfirm={() => {
                            currentPhaseRef.current = 'edit';
                            void sendMessage({
                              text: `Revert to the rubric from message ID ${message.id}`,
                            });
                          }}
                        />
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
          {conflictError ? (
            <div className="p-3 border-top">
              <Alert variant="danger" className="mb-2 small">
                {conflictError}
              </Alert>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm w-100"
                onClick={() => window.location.reload()}
              >
                <i className="bi bi-arrow-clockwise me-1" />
                Reload
              </button>
            </div>
          ) : !hasCourseInstancePermissionEdit ? (
            <OverlayTrigger
              placement="top"
              tooltip={{
                props: { id: 'read-only-tooltip' },
                body: 'Sending messages requires student data editor access or higher.',
              }}
            >
              <div className="px-3 py-2 border-top bg-white d-flex align-items-center justify-content-center text-body-secondary small">
                Read-only access
              </div>
            </OverlayTrigger>
          ) : (
            <div className="px-3 py-2 border-top">
              <textarea
                className="form-control mb-2"
                rows={2}
                placeholder="Message the AI assistant..."
                value={chatInput}
                disabled={isGenerating}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const trimmedText = chatInput.trim();
                    if (trimmedText.length > 0 && !isGenerating) {
                      currentPhaseRef.current = 'edit';
                      void sendMessage({ text: trimmedText });
                      setChatInput('');
                    }
                  }
                }}
              />
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  {!hasGeneratedRubric && (
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
                      Generate rubric
                    </button>
                  )}
                </div>
                {isGenerating ? (
                  isStopping ? (
                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled>
                      <span
                        className="spinner-border spinner-border-sm me-1"
                        role="status"
                        aria-hidden="true"
                      />
                      Stopping...
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => {
                        setIsStopping(true);
                        void fetch(`${chatUrl}/cancel`, {
                          method: 'POST',
                          headers: { 'X-CSRF-Token': chatCsrfToken },
                        });
                      }}
                    >
                      <i className="bi bi-stop-fill me-1" />
                      Stop
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={chatInput.trim().length === 0}
                    onClick={() => {
                      const trimmedText = chatInput.trim();
                      if (trimmedText.length === 0) return;
                      currentPhaseRef.current = 'edit';
                      void sendMessage({ text: trimmedText });
                      setChatInput('');
                    }}
                  >
                    <i className="bi bi-send-fill" />
                  </button>
                )}
              </div>
              <div className="text-muted small text-center mt-1">
                AI can make mistakes. Review the generated rubric.
              </div>
            </div>
          )}
        </div>
      )}

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
