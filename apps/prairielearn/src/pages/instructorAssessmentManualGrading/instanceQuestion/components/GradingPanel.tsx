import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dropdown } from 'react-bootstrap';

import { run } from '@prairielearn/run';

import { mathjaxTypeset } from '../../../../lib/client/mathjax.js';
import { idsEqual } from '../../../../lib/id.js';
import {
  AI_GRADING_MODAL_OPEN_EVENT,
  GRADING_PANEL_REFRESH_EVENT,
  MANUAL_GRADING_SCORE_USE_EVENT,
} from '../instanceQuestion.shared.js';

import type {
  GradingPanelGroup,
  GradingPanelProps,
  GradingPanelRefreshDetail,
} from './gradingPanel.types.js';

function roundPoints(points: number) {
  return Math.round(Number(points) * 100) / 100;
}

function formatSigned(points: number) {
  return (points >= 0 ? '+' : '') + roundPoints(points);
}

function subscribeToScoreUse(onStoreChange: () => void) {
  window.addEventListener(MANUAL_GRADING_SCORE_USE_EVENT, onStoreChange);
  return () => window.removeEventListener(MANUAL_GRADING_SCORE_USE_EVENT, onStoreChange);
}

function getScoreUsePercentage() {
  return window.localStorage.manual_grading_score_use === 'percentage';
}

export function GradingPanel({ data }: { data: GradingPanelProps }) {
  const [props, setProps] = useState(data);
  const usePercentage = useSyncExternalStore(
    subscribeToScoreUse,
    getScoreUsePercentage,
    () => false,
  );
  const [autoEditOpen, setAutoEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(Boolean(data.adjustPoints));
  const [selectedGroup, setSelectedGroup] = useState(props.selectedInstanceQuestionGroup);
  const [selectedRubricItemIds, setSelectedRubricItemIds] = useState(data.selectedRubricItemIds);
  const [adjustPoints, setAdjustPoints] = useState(data.adjustPoints);
  const [autoPoints, setAutoPoints] = useState(props.autoPoints);
  const [manualPoints, setManualPoints] = useState(props.manualPoints);
  const [feedback, setFeedback] = useState(props.feedback);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  const applyPanelProps = useCallback((next: GradingPanelProps, preserveSelections: boolean) => {
    setProps((current) => ({ ...next, csrfToken: current.csrfToken }));
    if (preserveSelections) {
      const nextIds = new Set(
        (next.rubricData?.rubric_items ?? []).map((item) => item.rubric_item.id),
      );
      setSelectedRubricItemIds((current) => current.filter((id) => nextIds.has(id)));
      if (!next.rubricData) {
        setManualPoints(next.manualPoints);
      }
      return;
    }
    setSelectedGroup(next.selectedInstanceQuestionGroup);
    setAdjustOpen(Boolean(next.adjustPoints));
    setAdjustPoints(next.adjustPoints);
    setAutoPoints(next.autoPoints);
    setFeedback(next.feedback);
    setSelectedRubricItemIds(next.selectedRubricItemIds);
    if (!next.rubricData) {
      setManualPoints(next.manualPoints);
    }
  }, []);

  useEffect(() => {
    if (props.context !== 'main') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<GradingPanelRefreshDetail>).detail;
      applyPanelProps(detail.panel, detail.preserveSelections ?? false);
      void mathjaxTypeset();
    };
    document.addEventListener(GRADING_PANEL_REFRESH_EVENT, handler);
    return () => document.removeEventListener(GRADING_PANEL_REFRESH_EVENT, handler);
  }, [applyPanelProps, props.context]);

  // Grow the feedback textarea to fit its content so graders can see the full note.
  useEffect(() => {
    const element = feedbackRef.current;
    if (!element) return;
    element.style.height = '';
    const style = window.getComputedStyle(element);
    element.style.height = `${
      element.scrollHeight +
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom)
    }px`;
  }, [feedback]);

  const disable = props.disable;
  const enableKeyboardShortcuts = props.context === 'main' && props.enableSingleKeyShortcuts;
  const enableEditKeyboardShortcuts = enableKeyboardShortcuts && !disable;
  const showNextShortcut = enableKeyboardShortcuts && props.skipText === 'Next';
  const showSkipGradedSubmissionsButton = !disable && props.context === 'main';
  const showAssignedToMeButton = !disable && props.context === 'main';
  const replaceAutoPoints = Boolean(props.rubricData?.rubric.replace_auto_points);
  const hasAutoPoints = Boolean(props.maxAutoPoints || autoPoints);
  const rubricActive = props.rubricData != null;
  const maxPoints = props.maxPoints ?? 0;
  const maxManualDenom = props.maxManualPoints || maxPoints;

  const computedManualPoints = run(() => {
    if (!props.rubricData) return manualPoints;
    const startingPoints = props.rubricData.rubric.starting_points;
    const itemsSum = props.rubricData.rubric_items
      .filter((item) => selectedRubricItemIds.includes(item.rubric_item.id))
      .reduce((sum, item) => sum + item.rubric_item.points, startingPoints);
    const cap =
      Number(replaceAutoPoints ? maxPoints : props.maxManualPoints) +
      Number(props.rubricData.rubric.max_extra_points);
    const rubricValue =
      Math.min(Math.max(roundPoints(itemsSum), props.rubricData.rubric.min_points), cap) +
      Number(adjustPoints);
    return roundPoints(rubricValue - (replaceAutoPoints ? autoPoints : 0));
  });

  const effectiveManualPoints = rubricActive ? computedManualPoints : manualPoints;
  const totalPoints = roundPoints(autoPoints + effectiveManualPoints);
  const autoPerc = roundPoints((autoPoints * 100) / (props.maxAutoPoints || maxPoints || 1));
  const manualPerc = roundPoints((effectiveManualPoints * 100) / (maxManualDenom || 1));
  const totalPerc = roundPoints((totalPoints * 100) / (maxPoints || 1));

  const gradedByAi = props.aiGradingInfo != null;
  const gradedByHuman = props.gradedByHumanName != null;

  async function selectGroup(group: GradingPanelGroup) {
    if (!props.manualInstanceQuestionGroupUrl) return;
    await fetch(props.manualInstanceQuestionGroupUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualInstanceQuestionGroupId: group.id }),
    });
    setSelectedGroup(group);
  }

  function toggleRubricItem(id: string, checked: boolean) {
    setSelectedRubricItemIds((current) =>
      checked
        ? [...current.filter((itemId) => itemId !== id), id]
        : current.filter((itemId) => itemId !== id),
    );
  }

  function openRubricSettings() {
    const panel = document.getElementById('rubric-setting');
    if (panel && !panel.classList.contains('show')) {
      document.querySelector<HTMLElement>('[data-bs-target="#rubric-setting"]')?.click();
    }
    (document.getElementById('rubric-editor') ?? panel)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  const showRubricInManualSection = !replaceAutoPoints || (!props.maxAutoPoints && !autoPoints);
  const groupSelected = selectedGroup.id != null;

  return (
    <form
      name="manual-grading-form"
      method="POST"
      data-max-auto-points={props.maxAutoPoints}
      data-max-manual-points={props.maxManualPoints}
      data-max-points={props.maxPoints ?? ''}
      data-rubric-active={rubricActive ? 'true' : 'false'}
    >
      <input type="hidden" name="__csrf_token" value={props.csrfToken} />
      <input type="hidden" name="modified_at" value={props.modifiedAt} />
      <input type="hidden" name="submission_id" value={props.submissionId} />
      <ul className="list-group list-group-flush">
        {maxPoints ? (
          <li className="list-group-item d-flex justify-content-center">
            <span>Points</span>
            <div className="form-check form-switch mx-2">
              <input
                className="form-check-input js-manual-grading-pts-perc-select"
                name="use_score_perc"
                id={`use-score-perc-${props.context}`}
                type="checkbox"
                checked={usePercentage}
                onChange={(event) => {
                  window.localStorage.manual_grading_score_use = event.target.checked
                    ? 'percentage'
                    : 'points';
                  window.dispatchEvent(new Event(MANUAL_GRADING_SCORE_USE_EVENT));
                }}
              />
              <label className="form-check-label" htmlFor={`use-score-perc-${props.context}`}>
                Percentage
              </label>
            </div>
          </li>
        ) : null}

        {props.showInstanceQuestionGroup && props.context === 'main' ? (
          <li className="list-group-item align-items-center">
            <label
              htmlFor="instance-question-group-toggle"
              className="form-label d-flex align-items-center gap-2"
            >
              Submission Group:
              {props.instanceQuestionGroups.length > 1 ? (
                <div
                  id="instance-question-group-description-tooltip"
                  data-bs-toggle="tooltip"
                  data-bs-html="true"
                  data-bs-title={selectedGroup.instance_question_group_description ?? ''}
                >
                  <i className="fas fa-circle-info text-secondary" />
                </div>
              ) : null}
            </label>
            <Dropdown className="w-100 mb-2">
              <Dropdown.Toggle
                id="instance-question-group-toggle"
                variant="light"
                className="border border-gray bg-white d-flex justify-content-between align-items-center w-100"
              >
                <span id="instance-question-group-selection-dropdown-span">
                  {selectedGroup.instance_question_group_name}
                </span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="py-0 overflow-hidden w-100">
                <div
                  id="instance-question-group-selection-dropdown"
                  style={{ maxHeight: '50vh' }}
                  className="overflow-auto py-2"
                  role="listbox"
                >
                  {props.instanceQuestionGroups.map((group) => {
                    const isSelected = run(() => {
                      if (!group.id) return selectedGroup.id == null;
                      if (!selectedGroup.id) return false;
                      return idsEqual(group.id, selectedGroup.id);
                    });
                    return (
                      <Dropdown.Item
                        key={group.id ?? 'empty'}
                        active={isSelected}
                        onClick={() => void selectGroup(group)}
                      >
                        {group.instance_question_group_name}
                      </Dropdown.Item>
                    );
                  })}
                </div>
              </Dropdown.Menu>
            </Dropdown>
          </li>
        ) : null}

        {props.graderGuidelinesHtml ? (
          <li className="list-group-item">
            <div className="mb-1">Guidelines:</div>
            <div
              className="markdown-body mt-3"
              data-testid="grader-guidelines"
              // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Staff-authored markdown rendered to HTML
              dangerouslySetInnerHTML={{ __html: props.graderGuidelinesHtml }}
            />
          </li>
        ) : null}

        {gradedByAi || gradedByHuman ? (
          <li className="list-group-item">
            <div className="d-flex align-items-center flex-wrap gap-1">
              <span>Graded by:</span>
              {gradedByAi ? <span className="badge text-bg-light border fw-medium">AI</span> : null}
              {gradedByAi && gradedByHuman ? <span>+</span> : null}
              {gradedByHuman ? <span>{props.gradedByHumanName}</span> : null}
              {gradedByAi ? (
                <a
                  href="#ai-grading-explanation"
                  className="btn btn-sm btn-link p-0 ms-auto text-decoration-none d-inline-flex align-items-center"
                  onClick={(event) => {
                    event.preventDefault();
                    document
                      .getElementById('ai-grading-explanation')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  <i className="bi bi-stars me-1" aria-hidden="true" />
                  View AI explanation
                </a>
              ) : null}
            </div>
            {gradedByAi && gradedByHuman ? (
              <div className="text-muted small mt-1">Human grading always takes priority</div>
            ) : null}
          </li>
        ) : null}

        <li className="list-group-item">
          <PointsBlock
            type="manual"
            label="Manual"
            context={props.context}
            points={effectiveManualPoints}
            maxPoints={props.maxManualPoints}
            percentage={manualPerc}
            showPercentage={Boolean(maxPoints)}
            showInput={!rubricActive}
            showInputEdit={false}
            disable={disable}
            usePercentage={usePercentage}
            onPointsChange={setManualPoints}
          />
          {showRubricInManualSection ? (
            <RubricInputSection
              props={props}
              disable={disable}
              usePercentage={usePercentage}
              selectedRubricItemIds={selectedRubricItemIds}
              adjustOpen={adjustOpen}
              adjustPoints={adjustPoints}
              onToggleItem={toggleRubricItem}
              onOpenAdjust={() => setAdjustOpen(true)}
              onAdjustPoints={setAdjustPoints}
              onEditRubric={openRubricSettings}
            />
          ) : null}
        </li>

        {hasAutoPoints ? (
          <>
            <li className="list-group-item">
              <PointsBlock
                type="auto"
                label="Auto"
                context={props.context}
                points={autoPoints}
                maxPoints={props.maxAutoPoints}
                percentage={autoPerc}
                showPercentage={Boolean(maxPoints)}
                showInput={autoEditOpen}
                showInputEdit={!disable}
                disable={disable}
                usePercentage={usePercentage}
                onPointsChange={setAutoPoints}
                onEdit={() => setAutoEditOpen(true)}
              />
            </li>
            <li className="list-group-item">
              <div className={clsx('mb-3 w-100', usePercentage ? 'd-none' : '')}>
                Total Points:
                <span className="float-end">
                  <span className="js-value-total-points">{roundPoints(totalPoints)}</span>
                  {' / '}
                  {maxPoints}
                </span>
              </div>
              {maxPoints ? (
                <div className={clsx('mb-3 w-100', usePercentage ? '' : 'd-none')}>
                  Total Score:
                  <span className="float-end">
                    <span className="js-value-total-percentage">{totalPerc}</span>%
                  </span>
                </div>
              ) : null}
              {replaceAutoPoints ? (
                <RubricInputSection
                  props={props}
                  disable={disable}
                  usePercentage={usePercentage}
                  selectedRubricItemIds={selectedRubricItemIds}
                  adjustOpen={adjustOpen}
                  adjustPoints={adjustPoints}
                  onToggleItem={toggleRubricItem}
                  onOpenAdjust={() => setAdjustOpen(true)}
                  onAdjustPoints={setAdjustPoints}
                  onEditRubric={openRubricSettings}
                />
              ) : null}
            </li>
          </>
        ) : null}

        <li className="list-group-item">
          <label>
            Feedback:
            {enableEditKeyboardShortcuts ? (
              <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent mb-1 ms-2">
                F
              </kbd>
            ) : null}
            <textarea
              ref={feedbackRef}
              name="submission_note"
              className="form-control js-submission-feedback"
              style={{ minHeight: '1em' }}
              readOnly={disable}
              aria-describedby={`submission-feedback-help-${props.context}`}
              data-key-binding={enableEditKeyboardShortcuts ? 'f' : undefined}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            <small
              id={`submission-feedback-help-${props.context}`}
              className="form-text text-muted"
            >
              Markdown formatting, such as *<em>emphasis</em>* or &#96;<code>code</code>&#96;, is
              permitted and will be used to format the feedback when presented to the student.
            </small>
          </label>
        </li>

        {props.openIssues.length > 0 && props.context !== 'existing' ? (
          <li className="list-group-item">
            {props.openIssues.map((issue) => (
              <div key={issue.id} className="form-check">
                <input
                  type="checkbox"
                  id={`close-issue-checkbox-${issue.id}`}
                  className="form-check-input"
                  name="unsafe_issue_ids_close"
                  value={issue.id}
                />
                <label
                  className="w-100 form-check-label"
                  htmlFor={`close-issue-checkbox-${issue.id}`}
                >
                  Close issue #{issue.id}
                </label>
              </div>
            ))}
          </li>
        ) : null}

        <li className="list-group-item d-flex align-items-center justify-content-end flex-wrap gap-2">
          <div>
            <div className="form-check">
              {showSkipGradedSubmissionsButton ? (
                <>
                  <input
                    id="skip_graded_submissions"
                    type="checkbox"
                    className="form-check-input"
                    name="skip_graded_submissions"
                    value="true"
                    defaultChecked={props.skipGradedSubmissions}
                  />
                  <label className="form-check-label" htmlFor="skip_graded_submissions">
                    Skip graded submissions
                  </label>
                </>
              ) : (
                <input
                  id="skip_graded_submissions"
                  type="hidden"
                  name="skip_graded_submissions"
                  value={props.skipGradedSubmissions ? 'true' : 'false'}
                />
              )}
            </div>
            <div className="form-check">
              {showAssignedToMeButton ? (
                <>
                  <input
                    id="show_submissions_assigned_to_me_only"
                    type="checkbox"
                    className="form-check-input"
                    name="show_submissions_assigned_to_me_only"
                    value="true"
                    defaultChecked={props.showSubmissionsAssignedToMeOnly}
                  />
                  <label
                    className="form-check-label"
                    htmlFor="show_submissions_assigned_to_me_only"
                  >
                    Skip submissions not assigned to me
                  </label>
                </>
              ) : (
                <input
                  id="show_submissions_assigned_to_me_only"
                  type="hidden"
                  name="show_submissions_assigned_to_me_only"
                  value={props.showSubmissionsAssignedToMeOnly ? 'true' : 'false'}
                />
              )}
            </div>
          </div>

          <span className="ms-auto">
            {!disable ? (
              <>
                {props.context === 'main' ? (
                  <div
                    id="grade-button-with-options"
                    className={clsx('btn-group', groupSelected ? '' : 'd-none')}
                  >
                    <button
                      type="submit"
                      className="btn btn-primary"
                      name="__action"
                      value="add_manual_grade"
                    >
                      Grade
                    </button>
                    <button
                      id="grade-options-dropdown"
                      type="button"
                      className="btn btn-primary dropdown-toggle dropdown-toggle-split"
                      data-bs-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded="false"
                    />
                    <div className="dropdown-menu dropdown-menu-end">
                      <button
                        type="submit"
                        className="dropdown-item"
                        name="__action"
                        value="add_manual_grade"
                      >
                        This instance question
                      </button>
                      <div className="dropdown-divider" />
                      <button
                        type="submit"
                        className="dropdown-item"
                        name="__action"
                        value="add_manual_grade_for_instance_question_group_ungraded"
                      >
                        All ungraded instance questions in submission group
                      </button>
                      <button
                        type="submit"
                        className="dropdown-item"
                        name="__action"
                        value="add_manual_grade_for_instance_question_group"
                      >
                        All instance questions in submission group
                      </button>
                      <div className="dropdown-item-text text-muted small">
                        AI can make mistakes. Review submission groups before grading.
                      </div>
                    </div>
                  </div>
                ) : null}
                <button
                  id="grade-button"
                  type="submit"
                  className={clsx(
                    'btn btn-primary align-items-center',
                    groupSelected ? 'd-none' : 'd-inline-flex',
                  )}
                  name="__action"
                  value="add_manual_grade"
                  data-key-binding={enableEditKeyboardShortcuts ? 'g' : undefined}
                >
                  Grade
                  {enableEditKeyboardShortcuts ? (
                    <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent ms-2">
                      G
                    </kbd>
                  ) : null}
                </button>
                {props.context === 'main' && props.aiGradingMode ? (
                  <button
                    id="ai-grade-button"
                    type="button"
                    className="btn btn-primary ms-1"
                    onClick={() =>
                      document.dispatchEvent(new CustomEvent(AI_GRADING_MODAL_OPEN_EVENT))
                    }
                  >
                    <i className="bi bi-stars me-1" aria-hidden="true" />
                    AI grade
                  </button>
                ) : null}
              </>
            ) : null}
            <div className="btn-group">
              <button
                type="submit"
                className={clsx(
                  'btn btn-secondary',
                  showNextShortcut ? 'd-inline-flex align-items-center' : '',
                )}
                name="__action"
                value="next_instance_question"
                data-key-binding={showNextShortcut ? 'n' : undefined}
              >
                {props.skipText}
                {showNextShortcut ? (
                  <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent ms-2">
                    N
                  </kbd>
                ) : null}
              </button>
              {!disable ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary dropdown-toggle dropdown-toggle-split"
                    data-bs-toggle="dropdown"
                    aria-haspopup="true"
                    aria-expanded="false"
                    aria-label="Change assigned grader"
                  />
                  <div className="dropdown-menu dropdown-menu-end">
                    {props.graders.map((grader) => (
                      <button
                        key={grader.id}
                        type="submit"
                        className="dropdown-item"
                        name="__action"
                        value={`reassign_${grader.id}`}
                      >
                        Assign to: {grader.name} ({grader.uid})
                      </button>
                    ))}
                    <button
                      type="submit"
                      className="dropdown-item"
                      name="__action"
                      value="reassign_nobody"
                    >
                      Tag for grading without assigned grader
                    </button>
                    <button
                      type="submit"
                      className="dropdown-item"
                      name="__action"
                      value="reassign_graded"
                    >
                      Tag as graded (keep current grade)
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </span>
        </li>
      </ul>
    </form>
  );
}

GradingPanel.displayName = 'GradingPanel';

function PointsBlock({
  type,
  label,
  context,
  points,
  maxPoints,
  percentage,
  showPercentage,
  showInput,
  showInputEdit,
  disable,
  usePercentage,
  onPointsChange,
  onEdit,
}: {
  type: 'manual' | 'auto';
  label: string;
  context: string;
  points: number;
  maxPoints: number;
  percentage: number;
  showPercentage: boolean;
  showInput: boolean;
  showInputEdit: boolean;
  disable: boolean;
  usePercentage: boolean;
  onPointsChange: (points: number) => void;
  onEdit?: () => void;
}) {
  const rounded = roundPoints(points);
  return (
    <div className="mb-3">
      <span className="w-100">
        <label
          htmlFor={`js-${type}-score-value-input-points-${context}`}
          className={clsx(usePercentage ? 'd-none' : '')}
        >
          {label} Points:
        </label>
        {showPercentage ? (
          <label
            htmlFor={`js-${type}-score-value-input-percentage-${context}`}
            className={clsx(usePercentage ? '' : 'd-none')}
          >
            {label} Score:
          </label>
        ) : null}
        <span className="float-end">
          {!showInput ? (
            <>
              <span className={clsx(usePercentage ? 'd-none' : '')}>
                <span>
                  <span>{rounded}</span>
                  {' / '}
                  {maxPoints}
                </span>
              </span>
              {showPercentage ? (
                <span className={clsx(usePercentage ? '' : 'd-none')}>
                  <span>{percentage}%</span>
                </span>
              ) : null}
            </>
          ) : null}
          {showInputEdit ? (
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className={clsx('btn btn-outline-secondary', showInput ? 'd-none' : '')}
                onClick={onEdit}
              >
                <i className="fas fa-pencil" />
              </button>
            </div>
          ) : null}
        </span>
      </span>
      <div className={clsx(usePercentage ? 'd-none' : '')}>
        <div className={clsx('input-group', !showInput ? 'd-none' : '')}>
          <input
            type="number"
            step="any"
            required={showInput}
            id={`js-${type}-score-value-input-points-${context}`}
            className={`form-control js-grading-score-input js-${type}-score-value-input-points`}
            name={`score_${type}_points`}
            value={rounded}
            disabled={disable}
            onChange={(event) => onPointsChange(Number(event.target.value))}
          />
          <span className="input-group-text">/ {maxPoints}</span>
        </div>
      </div>
      {showPercentage ? (
        <div className={clsx(usePercentage ? '' : 'd-none')}>
          <div className={clsx('input-group', !showInput ? 'd-none' : '')}>
            <input
              type="number"
              step="any"
              required={showInput}
              id={`js-${type}-score-value-input-percentage-${context}`}
              className={`form-control js-grading-score-input js-${type}-score-value-input-percentage`}
              name={`score_${type}_percent`}
              value={percentage}
              disabled={disable}
              onChange={(event) =>
                onPointsChange(roundPoints((Number(event.target.value) * maxPoints) / 100))
              }
            />
            <span className="input-group-text">%</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RubricInputSection({
  props,
  disable,
  usePercentage,
  selectedRubricItemIds,
  adjustOpen,
  adjustPoints,
  onToggleItem,
  onOpenAdjust,
  onAdjustPoints,
  onEditRubric,
}: {
  props: GradingPanelProps;
  disable: boolean;
  usePercentage: boolean;
  selectedRubricItemIds: string[];
  adjustOpen: boolean;
  adjustPoints: number;
  onToggleItem: (id: string, checked: boolean) => void;
  onOpenAdjust: () => void;
  onAdjustPoints: (points: number) => void;
  onEditRubric: () => void;
}) {
  if (!props.rubricData) return null;
  const enableKeyboardShortcuts =
    props.context === 'main' && !disable && props.enableSingleKeyShortcuts;
  const maxDenom = props.maxManualPoints || props.maxPoints || 1;
  const aiSelected = props.aiGradingInfo?.submissionManuallyGraded
    ? new Set(props.aiGradingInfo.selectedRubricItemIds)
    : null;

  return (
    <>
      <style>{`
        .js-selectable-rubric-item-label {
          border-color: rgba(0, 0, 0, 0);
          border-width: 1px;
          border-style: solid;
        }
        .js-selectable-rubric-item-label:has(input:checked) {
          border-color: rgba(0, 0, 0, 0.125);
          background-color: var(--light);
        }
        .js-selectable-rubric-item-label p { margin-bottom: 0; }
      `}</style>
      <div className="d-flex align-items-center justify-content-between mb-1">
        <div className="d-flex align-items-center gap-2 text-secondary" style={{ paddingLeft: 3 }}>
          {aiSelected ? (
            <>
              <div data-bs-toggle="tooltip" data-bs-title="AI grading">
                <i className="bi bi-stars" />
              </div>
              <div data-bs-toggle="tooltip" data-bs-title="Human grading">
                <i className="bi bi-person-fill" />
              </div>
            </>
          ) : null}
        </div>
        {!disable && props.context === 'main' ? (
          <button
            type="button"
            className="btn btn-sm btn-link p-0 text-decoration-none js-show-rubric-settings-button"
            onClick={onEditRubric}
          >
            <i className="bi bi-pencil me-1" aria-hidden="true" />
            Edit rubric
          </button>
        ) : null}
      </div>
      {props.rubricData.rubric_items.map((item) => {
        const id = item.rubric_item.id;
        const checked = selectedRubricItemIds.includes(id);
        const aiChecked = aiSelected ? aiSelected.has(id) : undefined;
        const keyBinding = item.rubric_item.key_binding;
        return (
          <div key={id}>
            <label className="js-selectable-rubric-item-label w-100">
              {aiChecked !== undefined ? (
                <input
                  type="checkbox"
                  style={{ marginLeft: 3, marginRight: 8 }}
                  name="rubric_item_selected_ai"
                  value={id}
                  checked={aiChecked}
                  title={aiChecked ? 'Selected by AI' : 'Not selected by AI'}
                  disabled
                />
              ) : null}
              <input
                type="checkbox"
                name="rubric_item_selected_manual"
                className="js-selectable-rubric-item me-2"
                value={id}
                checked={checked}
                disabled={disable}
                data-rubric-item-points={item.rubric_item.points}
                data-key-binding={enableKeyboardShortcuts && keyBinding ? keyBinding : undefined}
                onChange={(event) => onToggleItem(id, event.target.checked)}
              />
              {enableKeyboardShortcuts && keyBinding ? (
                <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent">
                  {keyBinding}
                </kbd>
              ) : null}
              <span
                className={`float-end text-${item.rubric_item.points >= 0 ? 'success' : 'danger'}`}
              >
                <strong>
                  <span
                    className={clsx(usePercentage ? 'd-none' : '')}
                    data-testid="rubric-item-points"
                  >
                    [{formatSigned(item.rubric_item.points)}]
                  </span>
                  {props.maxPoints ? (
                    <span className={clsx(usePercentage ? '' : 'd-none')}>
                      [{formatSigned((item.rubric_item.points * 100) / maxDenom)}%]
                    </span>
                  ) : null}
                </strong>
              </span>
              <span>
                <div
                  className="d-inline-block"
                  data-testid="rubric-item-description"
                  // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Rubric item HTML is rendered from staff markdown
                  dangerouslySetInnerHTML={{ __html: item.description_rendered ?? '' }}
                />
                <div
                  className="small text-muted"
                  data-testid="rubric-item-explanation"
                  // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Rubric item HTML is rendered from staff markdown
                  dangerouslySetInnerHTML={{ __html: item.explanation_rendered ?? '' }}
                />
                <div
                  className="small text-muted"
                  data-testid="rubric-item-grader-note"
                  // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Rubric item HTML is rendered from staff markdown
                  dangerouslySetInnerHTML={{ __html: item.grader_note_rendered ?? '' }}
                />
              </span>
            </label>
          </div>
        );
      })}
      <div className="js-adjust-points d-flex justify-content-end">
        <button
          type="button"
          className={clsx(
            'js-adjust-points-enable btn btn-sm btn-link',
            adjustOpen || disable ? 'd-none' : '',
          )}
          data-key-binding={enableKeyboardShortcuts ? 'a' : undefined}
          onClick={onOpenAdjust}
        >
          Apply adjustment
          {enableKeyboardShortcuts ? (
            <kbd aria-hidden="true" className="pl-kbd kbd-semi-transparent ms-2">
              A
            </kbd>
          ) : null}
        </button>
        <div className={clsx('js-adjust-points-input-container w-25', adjustOpen ? '' : 'd-none')}>
          <label>
            <span className="small">Adjustment:</span>
            <div className={clsx(usePercentage ? 'd-none' : '')}>
              <div className="input-group input-group-sm">
                <input
                  type="number"
                  step="any"
                  className="form-control js-adjust-points-points"
                  name="score_manual_adjust_points"
                  value={roundPoints(adjustPoints) || ''}
                  disabled={disable}
                  onChange={(event) => onAdjustPoints(Number(event.target.value))}
                />
              </div>
            </div>
            {props.maxPoints ? (
              <div className={clsx(usePercentage ? '' : 'd-none')}>
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    step="any"
                    className="form-control js-adjust-points-percentage"
                    name="score_manual_adjust_percent"
                    value={roundPoints((adjustPoints * 100) / maxDenom) || ''}
                    disabled={disable}
                    onChange={(event) =>
                      onAdjustPoints(roundPoints((Number(event.target.value) * maxDenom) / 100))
                    }
                  />
                  <span className="input-group-text">%</span>
                </div>
              </div>
            ) : null}
          </label>
        </div>
      </div>
    </>
  );
}
