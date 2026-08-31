import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Dropdown from 'react-bootstrap/Dropdown';
import Form from 'react-bootstrap/Form';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

import { INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT } from '../../../../lib/client/manual-grading-events.js';
import { mathjaxTypeset } from '../../../../lib/client/mathjax.js';
import type { RubricData } from '../../../../lib/manualGrading.types.js';
import { AI_GRADING_MODAL_OPEN_EVENT } from '../instanceQuestion.shared.js';

import { GradingPoints, TotalPoints } from './GradingPoints.js';
import { RubricInput } from './RubricInput.js';

type ManualGradingContext = 'conflicting' | 'existing' | 'main';

export interface InstanceQuestionGradingPanelProps {
  context: ManualGradingContext;
  disabled: boolean;
  aiGradingMode: boolean;
  assessmentQuestion: {
    id: string;
    maxAutoPoints: number;
    maxManualPoints: number;
    maxPoints: number;
  };
  instanceQuestion: {
    autoPoints: number;
    manualPoints: number;
    modifiedAt: string;
    points: number;
  };
  submission: {
    feedback: string;
    id: string;
    rubricGrading: {
      adjustPoints: number;
      rubricItems: Record<string, { score: number }> | null;
    } | null;
  };
  graders: { id: string; name: string; uid: string }[];
  graderGuidelinesRendered: string | null;
  gradedByHumanName: string | null;
  aiGradingInfo: {
    selectedRubricItemIds: string[];
    submissionManuallyGraded: boolean;
  } | null;
  openIssueIds: string[];
  rubricData: RubricData | null;
  showInstanceQuestionGroup: boolean;
  instanceQuestionGroups: {
    description: string;
    id: string;
    name: string;
  }[];
  selectedInstanceQuestionGroupId: string | null;
  manualInstanceQuestionGroupUrl: string;
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  skipText: string;
  enableSingleKeyShortcuts: boolean;
  csrfToken: string;
}

interface GradingFormState {
  adjustmentPercentage: string;
  adjustmentPoints: string;
  autoEditing: boolean;
  autoPercentage: string;
  autoPoints: string;
  closeIssueIds: Set<string>;
  feedback: string;
  manualPercentage: string;
  manualPoints: string;
  selectedGroupId: string | null;
  selectedRubricItemIds: Set<string>;
  showAdjustment: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  skipGradedSubmissions: boolean;
}

interface GradingPanelUpdateEventDetail {
  gradingPanelProps: InstanceQuestionGradingPanelProps;
  preserveValues: boolean;
}

const SCORE_DISPLAY_CHANGE_EVENT = 'manual-grading-score-display-change';

declare global {
  interface Window {
    bootstrap: {
      Modal: {
        getOrCreateInstance: (element: Element) => { show: () => void };
      };
    };
  }
}

function roundPoints(points: number): number {
  return Math.round(points * 100) / 100;
}

function pointsValue(points: number): string {
  return `${roundPoints(points) || 0}`;
}

function percentageValue(points: number, maxPoints: number): string {
  return pointsValue((points * 100) / maxPoints);
}

function subscribeToScoreDisplay(callback: () => void): () => void {
  document.addEventListener(SCORE_DISPLAY_CHANGE_EVENT, callback);
  return () => document.removeEventListener(SCORE_DISPLAY_CHANGE_EVENT, callback);
}

function getScoreDisplaySnapshot(): boolean {
  return window.localStorage.manual_grading_score_use === 'percentage';
}

function createFormState(
  data: InstanceQuestionGradingPanelProps,
  current?: GradingFormState,
): GradingFormState {
  const maxRubricPoints =
    data.assessmentQuestion.maxManualPoints || data.assessmentQuestion.maxPoints;
  const rubricItemIds = new Set(data.rubricData?.rubric_items.map((item) => item.rubric_item.id));
  const selectedRubricItemIds = current
    ? new Set([...current.selectedRubricItemIds].filter((id) => rubricItemIds.has(id)))
    : new Set(
        Object.entries(data.submission.rubricGrading?.rubricItems ?? {})
          .filter(([, item]) => item.score)
          .map(([id]) => id),
      );
  const adjustmentPoints = current
    ? current.adjustmentPoints
    : data.submission.rubricGrading?.adjustPoints
      ? pointsValue(data.submission.rubricGrading.adjustPoints)
      : '';
  const adjustmentPercentage = current
    ? current.adjustmentPercentage
    : adjustmentPoints
      ? percentageValue(Number(adjustmentPoints), maxRubricPoints)
      : '';

  const next: GradingFormState = {
    adjustmentPercentage,
    adjustmentPoints,
    autoEditing: current?.autoEditing ?? false,
    autoPercentage:
      current?.autoPercentage ??
      percentageValue(
        data.instanceQuestion.autoPoints,
        data.assessmentQuestion.maxAutoPoints || data.assessmentQuestion.maxPoints,
      ),
    autoPoints: current?.autoPoints ?? pointsValue(data.instanceQuestion.autoPoints),
    closeIssueIds: current?.closeIssueIds ?? new Set(),
    feedback: current?.feedback ?? data.submission.feedback,
    manualPercentage:
      current?.manualPercentage ??
      percentageValue(
        data.instanceQuestion.manualPoints,
        data.assessmentQuestion.maxManualPoints || data.assessmentQuestion.maxPoints,
      ),
    manualPoints: current?.manualPoints ?? pointsValue(data.instanceQuestion.manualPoints),
    selectedGroupId: current?.selectedGroupId ?? data.selectedInstanceQuestionGroupId,
    selectedRubricItemIds,
    showAdjustment: current?.showAdjustment ?? Boolean(data.submission.rubricGrading?.adjustPoints),
    showSubmissionsAssignedToMeOnly:
      current?.showSubmissionsAssignedToMeOnly ?? data.showSubmissionsAssignedToMeOnly,
    skipGradedSubmissions: current?.skipGradedSubmissions ?? data.skipGradedSubmissions,
  };

  return syncRubricScore(data, next);
}

function syncRubricScore(
  data: InstanceQuestionGradingPanelProps,
  state: GradingFormState,
): GradingFormState {
  if (!data.rubricData) return state;

  const { rubric, rubric_items: rubricItems } = data.rubricData;
  const itemPoints = rubricItems
    .filter((item) => state.selectedRubricItemIds.has(item.rubric_item.id))
    .reduce((sum, item) => sum + item.rubric_item.points, rubric.starting_points);
  const maxRubricPoints =
    (rubric.replace_auto_points
      ? data.assessmentQuestion.maxPoints
      : data.assessmentQuestion.maxManualPoints) + rubric.max_extra_points;
  const rubricPoints =
    Math.min(Math.max(roundPoints(itemPoints), rubric.min_points), maxRubricPoints) +
    Number(state.adjustmentPoints || 0);
  const manualPoints = rubricPoints - (rubric.replace_auto_points ? Number(state.autoPoints) : 0);

  return {
    ...state,
    manualPercentage: percentageValue(
      manualPoints,
      data.assessmentQuestion.maxManualPoints || data.assessmentQuestion.maxPoints,
    ),
    manualPoints: pointsValue(manualPoints),
  };
}

function isEditableShortcutTarget(target: HTMLElement): boolean {
  if (target.isContentEditable || ['SELECT', 'TEXTAREA'].includes(target.tagName)) return true;
  return (
    target instanceof HTMLInputElement &&
    !['button', 'checkbox', 'radio', 'submit'].includes(target.type)
  );
}

export function InstanceQuestionGradingPanel({
  data: initialData,
}: {
  data: InstanceQuestionGradingPanelProps;
}) {
  const [data, setData] = useState(initialData);
  const [formState, setFormState] = useState(() => createFormState(initialData));
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupUpdating, setGroupUpdating] = useState(false);
  const usePercentage = useSyncExternalStore(
    subscribeToScoreDisplay,
    getScoreDisplaySnapshot,
    () => false,
  );
  const adjustmentInputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const gradeButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const maxPoints = data.assessmentQuestion.maxPoints;
  const maxRubricPoints = data.assessmentQuestion.maxManualPoints || maxPoints;
  const hasAutoPoints =
    data.assessmentQuestion.maxAutoPoints !== 0 || Number(formState.autoPoints) !== 0;
  const showRubricWithTotal = Boolean(data.rubricData?.rubric.replace_auto_points && hasAutoPoints);
  const totalPoints = roundPoints(
    Number(formState.autoPoints || 0) + Number(formState.manualPoints || 0),
  );
  const editShortcuts = data.context === 'main' && data.enableSingleKeyShortcuts && !data.disabled;
  const showNextShortcut =
    data.context === 'main' && data.enableSingleKeyShortcuts && data.skipText === 'Next';
  const aiSelectedRubricItemIds = data.aiGradingInfo?.submissionManuallyGraded
    ? new Set(data.aiGradingInfo.selectedRubricItemIds)
    : null;

  const updateFormState = useCallback(
    (update: (current: GradingFormState) => GradingFormState) => {
      setFormState((current) => syncRubricScore(data, update(current)));
    },
    [data],
  );

  const adjustFeedbackHeight = useCallback(() => {
    const element = feedbackRef.current;
    if (!element) return;
    element.style.height = '';
    if (element.scrollHeight) {
      const style = window.getComputedStyle(element);
      element.style.height = `${
        element.scrollHeight +
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom)
      }px`;
    }
  }, []);

  useEffect(() => {
    // AI grading and rubric editing live in separate React islands. This event replaces the panel
    // data without coupling those islands to this component's internal form state.
    if (data.context !== 'main') return;
    const handleUpdate = (event: Event) => {
      const { gradingPanelProps, preserveValues } = (
        event as CustomEvent<GradingPanelUpdateEventDetail>
      ).detail;
      setData((current) => ({
        ...gradingPanelProps,
        context: current.context,
        csrfToken: current.csrfToken,
      }));
      setFormState((current) =>
        createFormState(gradingPanelProps, preserveValues ? current : undefined),
      );
    };
    document.addEventListener(INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT, handleUpdate);
    return () =>
      document.removeEventListener(INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT, handleUpdate);
  }, [data.context]);

  useEffect(() => {
    // Rubric descriptions and grader guidelines can contain math, including after an island update.
    if (formRef.current) void mathjaxTypeset([formRef.current]);
  }, [data]);

  useEffect(() => {
    // The conflict modal remains server-rendered around two React grading-panel islands. Bootstrap
    // owns its visibility, while React owns the controls inside it.
    if (data.context !== 'existing') return;
    const modal = document.getElementById('conflictGradingJobModal');
    if (!modal) return;
    modal.addEventListener('shown.bs.modal', adjustFeedbackHeight);
    window.bootstrap.Modal.getOrCreateInstance(modal).show();
    return () => modal.removeEventListener('shown.bs.modal', adjustFeedbackHeight);
  }, [adjustFeedbackHeight, data.context]);

  useEffect(() => {
    adjustFeedbackHeight();
  }, [adjustFeedbackHeight, formState.feedback]);

  useEffect(() => {
    // Single-key shortcuts are scoped to the main panel so hidden conflict panels cannot react to
    // the same keystroke. Text-entry controls and modified key combinations retain native behavior.
    if (data.context !== 'main' || !data.enableSingleKeyShortcuts) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !(event.target instanceof HTMLElement) ||
        isEditableShortcutTarget(event.target) ||
        document.querySelector('.modal.show')
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'n' && showNextShortcut) {
        nextButtonRef.current?.click();
      }
      if (!editShortcuts) return;
      if (key === 'f') {
        event.preventDefault();
        feedbackRef.current?.focus();
      } else if (key === 'g') {
        gradeButtonRef.current?.click();
      } else if (key === 'a' && data.rubricData && !formState.showAdjustment) {
        setFormState((current) => ({ ...current, showAdjustment: true }));
        requestAnimationFrame(() => adjustmentInputRef.current?.focus());
      }

      const rubricItem = data.rubricData?.rubric_items.find(
        (item) => item.rubric_item.key_binding?.toLowerCase() === key,
      );
      if (rubricItem) {
        updateFormState((current) => {
          const selectedRubricItemIds = new Set(current.selectedRubricItemIds);
          const id = rubricItem.rubric_item.id;
          if (selectedRubricItemIds.has(id)) {
            selectedRubricItemIds.delete(id);
          } else {
            selectedRubricItemIds.add(id);
          }
          return { ...current, selectedRubricItemIds };
        });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [data, editShortcuts, formState.showAdjustment, showNextShortcut, updateFormState]);

  const rubricInput = data.rubricData ? (
    <RubricInput
      adjustmentInputRef={adjustmentInputRef}
      adjustmentPercentage={formState.adjustmentPercentage}
      adjustmentPoints={formState.adjustmentPoints}
      aiSelectedRubricItemIds={aiSelectedRubricItemIds}
      disabled={data.disabled}
      enableKeyboardShortcuts={editShortcuts}
      maxPoints={maxPoints}
      maxRubricPoints={maxRubricPoints}
      rubricData={data.rubricData}
      selectedRubricItemIds={formState.selectedRubricItemIds}
      showAdjustment={formState.showAdjustment}
      showEditRubricButton={data.context === 'main'}
      usePercentage={usePercentage}
      onRubricItemChange={(id, selected) =>
        updateFormState((current) => {
          const selectedRubricItemIds = new Set(current.selectedRubricItemIds);
          if (selected) {
            selectedRubricItemIds.add(id);
          } else {
            selectedRubricItemIds.delete(id);
          }
          return { ...current, selectedRubricItemIds };
        })
      }
      onShowAdjustment={() => {
        setFormState((current) => ({ ...current, showAdjustment: true }));
        requestAnimationFrame(() => adjustmentInputRef.current?.focus());
      }}
      onAdjustmentPointsChange={(value) =>
        updateFormState((current) => ({
          ...current,
          adjustmentPercentage: value ? percentageValue(Number(value), maxRubricPoints) : '',
          adjustmentPoints: value,
        }))
      }
      onAdjustmentPercentageChange={(value) =>
        updateFormState((current) => ({
          ...current,
          adjustmentPercentage: value,
          adjustmentPoints: value ? pointsValue((Number(value) * maxRubricPoints) / 100) : '',
        }))
      }
    />
  ) : null;

  return (
    <form ref={formRef} name="manual-grading-form" method="POST">
      <input type="hidden" name="__csrf_token" value={data.csrfToken} />
      <input type="hidden" name="modified_at" value={data.instanceQuestion.modifiedAt} />
      <input type="hidden" name="submission_id" value={data.submission.id} />

      <ul className="list-group list-group-flush">
        {maxPoints > 0 && (
          <li className="list-group-item d-flex justify-content-center">
            <span>Points</span>
            <Form.Check
              className="form-switch mx-2"
              type="switch"
              name="use_score_perc"
              id={`use-score-percentage-${data.context}`}
              aria-label="Grade using percentages"
              checked={usePercentage}
              onChange={(event) => {
                const next = event.target.checked;
                window.localStorage.manual_grading_score_use = next ? 'percentage' : 'points';
                document.dispatchEvent(new Event(SCORE_DISPLAY_CHANGE_EVENT));
              }}
            />
            <Form.Label className="mb-0" htmlFor={`use-score-percentage-${data.context}`}>
              Percentage
            </Form.Label>
          </li>
        )}

        {data.showInstanceQuestionGroup && data.context === 'main' && (
          <li className="list-group-item">
            <Form.Label id="instance-question-group-label" htmlFor="instance-question-group-toggle">
              Submission group
            </Form.Label>
            <RichSelect
              id="instance-question-group-toggle"
              aria-labelledby="instance-question-group-label"
              disabled={data.disabled || groupUpdating}
              errorMessage={groupError ?? undefined}
              items={[
                ...data.instanceQuestionGroups.map<RichSelectItem>((group) => ({
                  value: group.id,
                  label: group.name,
                  description: group.description,
                })),
                { value: 'null', label: 'No group', description: 'No group assigned.' },
              ]}
              value={formState.selectedGroupId ?? 'null'}
              onChange={(selected) => {
                const selectedGroupId = selected === 'null' ? null : selected;
                setGroupUpdating(true);
                setGroupError(null);
                void fetch(data.manualInstanceQuestionGroupUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ manualInstanceQuestionGroupId: selectedGroupId }),
                })
                  .then((response) => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    setFormState((current) => ({ ...current, selectedGroupId }));
                  })
                  .catch(() => setGroupError('Failed to update the submission group.'))
                  .finally(() => setGroupUpdating(false));
              }}
            />
          </li>
        )}

        {data.graderGuidelinesRendered && (
          <li className="list-group-item">
            <div className="mb-1">Guidelines:</div>
            <div
              className="markdown-body mt-3"
              data-testid="grader-guidelines"
              // The server handles Markdown, Mustache substitution, and template-error escaping.
              // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
              dangerouslySetInnerHTML={{ __html: data.graderGuidelinesRendered }}
            />
          </li>
        )}

        {(data.aiGradingInfo || data.gradedByHumanName) && (
          <li className="list-group-item">
            <div className="d-flex align-items-center flex-wrap gap-1">
              <span>Graded by:</span>
              {data.aiGradingInfo && (
                <span className="badge text-bg-light border fw-medium">AI</span>
              )}
              {data.aiGradingInfo && data.gradedByHumanName && <span>+</span>}
              {data.gradedByHumanName && <span>{data.gradedByHumanName}</span>}
              {data.aiGradingInfo && (
                <a
                  href="#ai-grading-explanation"
                  className="btn btn-sm btn-link p-0 ms-auto text-decoration-none d-inline-flex align-items-center"
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById('ai-grading-explanation')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                >
                  <i className="bi bi-stars me-1" aria-hidden="true" />
                  View AI explanation
                </a>
              )}
            </div>
            {data.aiGradingInfo && data.gradedByHumanName && (
              <div className="text-muted small mt-1">Human grading always takes priority</div>
            )}
          </li>
        )}

        <li className="list-group-item">
          <GradingPoints
            context={data.context}
            disabled={data.disabled}
            editing={false}
            label="Manual"
            maxPoints={data.assessmentQuestion.maxManualPoints}
            percentageValue={formState.manualPercentage}
            pointsValue={formState.manualPoints}
            showEditButton={false}
            showInput={!data.rubricData}
            showPercentage={maxPoints > 0}
            type="manual"
            usePercentage={usePercentage}
            onEnableEditing={() => {}}
            onPointsChange={(value) =>
              setFormState((current) => ({
                ...current,
                manualPercentage: value
                  ? percentageValue(
                      Number(value),
                      data.assessmentQuestion.maxManualPoints || maxPoints,
                    )
                  : '',
                manualPoints: value,
              }))
            }
            onPercentageChange={(value) =>
              setFormState((current) => ({
                ...current,
                manualPercentage: value,
                manualPoints: value
                  ? pointsValue(
                      (Number(value) * (data.assessmentQuestion.maxManualPoints || maxPoints)) /
                        100,
                    )
                  : '',
              }))
            }
          />
          {!showRubricWithTotal && rubricInput}
        </li>

        {hasAutoPoints && (
          <>
            <li className="list-group-item">
              <GradingPoints
                context={data.context}
                disabled={data.disabled}
                editing={formState.autoEditing}
                label="Auto"
                maxPoints={data.assessmentQuestion.maxAutoPoints}
                percentageValue={formState.autoPercentage}
                pointsValue={formState.autoPoints}
                showEditButton={!data.disabled}
                showInput={false}
                showPercentage={maxPoints > 0}
                type="auto"
                usePercentage={usePercentage}
                onEnableEditing={() =>
                  setFormState((current) => ({ ...current, autoEditing: true }))
                }
                onPointsChange={(value) =>
                  updateFormState((current) => ({
                    ...current,
                    autoPercentage: value
                      ? percentageValue(
                          Number(value),
                          data.assessmentQuestion.maxAutoPoints || maxPoints,
                        )
                      : '',
                    autoPoints: value,
                  }))
                }
                onPercentageChange={(value) =>
                  updateFormState((current) => ({
                    ...current,
                    autoPercentage: value,
                    autoPoints: value
                      ? pointsValue(
                          (Number(value) * (data.assessmentQuestion.maxAutoPoints || maxPoints)) /
                            100,
                        )
                      : '',
                  }))
                }
              />
            </li>
            <li className="list-group-item">
              <TotalPoints
                maxPoints={maxPoints}
                percentageValue={percentageValue(totalPoints, maxPoints)}
                pointsValue={pointsValue(totalPoints)}
                usePercentage={usePercentage}
              />
              {showRubricWithTotal && rubricInput}
            </li>
          </>
        )}

        <li className="list-group-item">
          <Form.Label htmlFor={`submission-feedback-${data.context}`}>
            Feedback:
            {editShortcuts && (
              <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent mb-1 ms-2">
                F
              </kbd>
            )}
          </Form.Label>
          <Form.Control
            ref={feedbackRef}
            as="textarea"
            id={`submission-feedback-${data.context}`}
            name="submission_note"
            readOnly={data.disabled}
            aria-describedby={`submission-feedback-help-${data.context}`}
            data-key-binding={editShortcuts ? 'f' : undefined}
            value={formState.feedback}
            style={{ minHeight: '1em' }}
            onChange={(event) =>
              setFormState((current) => ({ ...current, feedback: event.target.value }))
            }
          />
          <Form.Text id={`submission-feedback-help-${data.context}`} muted>
            Markdown formatting, such as *<em>emphasis</em>* or <code>`code`</code>, is permitted
            and will be used to format the feedback when presented to the student.
          </Form.Text>
        </li>

        {data.context !== 'existing' && data.openIssueIds.length > 0 && (
          <li className="list-group-item">
            {data.openIssueIds.map((id) => (
              <Form.Check
                key={id}
                type="checkbox"
                id={`close-issue-checkbox-${data.context}-${id}`}
                name="unsafe_issue_ids_close"
                value={id}
                checked={formState.closeIssueIds.has(id)}
                label={`Close issue #${id}`}
                onChange={(event) =>
                  setFormState((current) => {
                    const closeIssueIds = new Set(current.closeIssueIds);
                    if (event.target.checked) {
                      closeIssueIds.add(id);
                    } else {
                      closeIssueIds.delete(id);
                    }
                    return { ...current, closeIssueIds };
                  })
                }
              />
            ))}
          </li>
        )}

        <li className="list-group-item d-flex align-items-center justify-content-end flex-wrap gap-2">
          <div>
            {data.context === 'main' && !data.disabled ? (
              <>
                <Form.Check
                  type="checkbox"
                  id="skip-graded-submissions"
                  name="skip_graded_submissions"
                  value="true"
                  checked={formState.skipGradedSubmissions}
                  label="Skip graded submissions"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      skipGradedSubmissions: event.target.checked,
                    }))
                  }
                />
                <Form.Check
                  type="checkbox"
                  id="show-submissions-assigned-to-me-only"
                  name="show_submissions_assigned_to_me_only"
                  value="true"
                  checked={formState.showSubmissionsAssignedToMeOnly}
                  label="Skip submissions not assigned to me"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      showSubmissionsAssignedToMeOnly: event.target.checked,
                    }))
                  }
                />
              </>
            ) : (
              <>
                <input
                  type="hidden"
                  name="skip_graded_submissions"
                  value={`${formState.skipGradedSubmissions}`}
                />
                <input
                  type="hidden"
                  name="show_submissions_assigned_to_me_only"
                  value={`${formState.showSubmissionsAssignedToMeOnly}`}
                />
              </>
            )}
          </div>

          <div className="ms-auto d-flex flex-wrap gap-1">
            {!data.disabled && (
              <>
                {data.context === 'main' && formState.selectedGroupId ? (
                  <Dropdown as={ButtonGroup} id="grade-button-with-options">
                    <Button
                      ref={gradeButtonRef}
                      type="submit"
                      name="__action"
                      value="add_manual_grade"
                    >
                      Grade
                      {editShortcuts && (
                        <kbd className="pl-kbd kbd-semi-transparent ms-2" aria-hidden="true">
                          G
                        </kbd>
                      )}
                    </Button>
                    <Dropdown.Toggle aria-label="Grade options" split />
                    <Dropdown.Menu align="end">
                      <Dropdown.Item
                        as="button"
                        type="submit"
                        name="__action"
                        value="add_manual_grade"
                      >
                        This instance question
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item
                        as="button"
                        type="submit"
                        name="__action"
                        value="add_manual_grade_for_instance_question_group_ungraded"
                      >
                        All ungraded instance questions in submission group
                      </Dropdown.Item>
                      <Dropdown.Item
                        as="button"
                        type="submit"
                        name="__action"
                        value="add_manual_grade_for_instance_question_group"
                      >
                        All instance questions in submission group
                      </Dropdown.Item>
                      <Dropdown.Header>
                        AI can make mistakes. Review submission groups before grading.
                      </Dropdown.Header>
                    </Dropdown.Menu>
                  </Dropdown>
                ) : (
                  <Button
                    ref={gradeButtonRef}
                    id={data.context === 'main' ? 'grade-button' : undefined}
                    type="submit"
                    name="__action"
                    value="add_manual_grade"
                  >
                    Grade
                    {editShortcuts && (
                      <kbd className="pl-kbd kbd-semi-transparent ms-2" aria-hidden="true">
                        G
                      </kbd>
                    )}
                  </Button>
                )}

                {data.context === 'main' && data.aiGradingMode && (
                  <Button
                    id="ai-grade-button"
                    type="button"
                    title=""
                    // The AI-grading island imperatively updates this button before this island may hydrate.
                    suppressHydrationWarning
                    onClick={() =>
                      document.dispatchEvent(new CustomEvent(AI_GRADING_MODAL_OPEN_EVENT))
                    }
                  >
                    <i className="bi bi-stars me-1" aria-hidden="true" />
                    AI grade
                  </Button>
                )}
              </>
            )}

            <Dropdown as={ButtonGroup}>
              <Button
                ref={nextButtonRef}
                type="submit"
                variant="secondary"
                name="__action"
                value="next_instance_question"
              >
                {data.skipText}
                {showNextShortcut && (
                  <kbd className="pl-kbd kbd-semi-transparent ms-2" aria-hidden="true">
                    N
                  </kbd>
                )}
              </Button>
              {!data.disabled && (
                <>
                  <Dropdown.Toggle variant="secondary" aria-label="Change assigned grader" split />
                  <Dropdown.Menu align="end">
                    {data.graders.map((grader) => (
                      <Dropdown.Item
                        key={grader.id}
                        as="button"
                        type="submit"
                        name="__action"
                        value={`reassign_${grader.id}`}
                      >
                        Assign to {grader.name} ({grader.uid})
                      </Dropdown.Item>
                    ))}
                    <Dropdown.Item
                      as="button"
                      type="submit"
                      name="__action"
                      value="reassign_nobody"
                    >
                      Tag for grading without assigned grader
                    </Dropdown.Item>
                    <Dropdown.Item
                      as="button"
                      type="submit"
                      name="__action"
                      value="reassign_graded"
                    >
                      Tag as graded (keep current grade)
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </>
              )}
            </Dropdown>
          </div>
        </li>
      </ul>
    </form>
  );
}

InstanceQuestionGradingPanel.displayName = 'InstanceQuestionGradingPanel';
