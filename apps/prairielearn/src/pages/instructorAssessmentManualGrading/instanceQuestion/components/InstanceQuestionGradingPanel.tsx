import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Form from 'react-bootstrap/Form';

import { subscribeToInstanceQuestionGradingPanelUpdates } from '../../../../lib/client/manual-grading-events.js';
import { mathjaxTypeset } from '../../../../lib/client/mathjax.js';

import { GradingPoints, TotalPoints } from './GradingPoints.js';
import { InstanceQuestionGradingActions } from './InstanceQuestionGradingActions.js';
import type {
  GradingFormState,
  InstanceQuestionGradingPanelProps,
} from './InstanceQuestionGradingPanel.types.js';
import { InstanceQuestionGroupSelector } from './InstanceQuestionGroupSelector.js';
import { RubricInput } from './RubricInput.js';
import {
  createFormState,
  percentageValue,
  pointsValue,
  roundPoints,
  syncRubricScore,
} from './instanceQuestionGradingPanelState.js';

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

function subscribeToScoreDisplay(callback: () => void): () => void {
  document.addEventListener(SCORE_DISPLAY_CHANGE_EVENT, callback);
  return () => document.removeEventListener(SCORE_DISPLAY_CHANGE_EVENT, callback);
}

function getScoreDisplaySnapshot(): boolean {
  return window.localStorage.manual_grading_score_use === 'percentage';
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
  const showRubricWithTotal = Boolean(data.rubricData?.replaceAutoPoints && hasAutoPoints);
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
    return subscribeToInstanceQuestionGradingPanelUpdates<InstanceQuestionGradingPanelProps>(
      ({ gradingPanelProps, preserveValues }) => {
        setData((current) => ({
          ...gradingPanelProps,
          context: current.context,
          csrfToken: current.csrfToken,
        }));
        setFormState((current) =>
          createFormState(gradingPanelProps, preserveValues ? current : undefined),
        );
      },
    );
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

      const rubricItem = data.rubricData?.items.find(
        (item) => item.keyBinding?.toLowerCase() === key,
      );
      if (rubricItem) {
        updateFormState((current) => {
          const selectedRubricItemIds = new Set(current.selectedRubricItemIds);
          const id = rubricItem.id;
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
          <InstanceQuestionGroupSelector
            disabled={data.disabled}
            groups={data.instanceQuestionGroups}
            selectedGroupId={formState.selectedGroupId}
            updateUrl={data.manualInstanceQuestionGroupUrl}
            onChange={(selectedGroupId) =>
              setFormState((current) => ({ ...current, selectedGroupId }))
            }
          />
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

        <InstanceQuestionGradingActions
          aiGradingMode={data.aiGradingMode}
          context={data.context}
          disabled={data.disabled}
          editShortcuts={editShortcuts}
          gradeButtonRef={gradeButtonRef}
          graders={data.graders}
          nextButtonRef={nextButtonRef}
          selectedGroupId={formState.selectedGroupId}
          showNextShortcut={showNextShortcut}
          showSubmissionsAssignedToMeOnly={formState.showSubmissionsAssignedToMeOnly}
          skipGradedSubmissions={formState.skipGradedSubmissions}
          skipText={data.skipText}
          onShowSubmissionsAssignedToMeOnlyChange={(value) =>
            setFormState((current) => ({
              ...current,
              showSubmissionsAssignedToMeOnly: value,
            }))
          }
          onSkipGradedSubmissionsChange={(value) =>
            setFormState((current) => ({ ...current, skipGradedSubmissions: value }))
          }
        />
      </ul>
    </form>
  );
}

InstanceQuestionGradingPanel.displayName = 'InstanceQuestionGradingPanel';
