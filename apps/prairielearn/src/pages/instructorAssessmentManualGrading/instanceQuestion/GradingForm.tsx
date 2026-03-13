import { useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import { mathjaxTypeset } from '../../../lib/client/mathjax.js';
import type { StaffInstanceQuestionGroup, StaffUser } from '../../../lib/client/safe-db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { GradingPointsInput, TotalPointsDisplay, roundPoints } from './GradingPointsSection.js';
import { RubricInputSection } from './RubricInputSection.js';
import type { RubricGradingData } from './queries.js';

interface GradingFormValues {
  autoPoints: number;
  manualPoints: number;
  adjustPoints: number;
  usePercentage: boolean;
  selectedRubricItemIds: string[];
}

export function GradingForm({
  csrfToken,
  modifiedAt,
  submissionId,
  maxAutoPoints,
  maxManualPoints,
  maxPoints,
  initialAutoPoints,
  initialManualPoints,
  submissionFeedback,
  rubricData,
  rubricGrading,
  openIssues,
  graders,
  aiGradingInfo,
  disabled,
  skipText,
  context,
  showInstanceQuestionGroup,
  selectedInstanceQuestionGroupProp,
  instanceQuestionGroups,
  skipGradedSubmissions,
  showSubmissionsAssignedToMeOnly,
  graderGuidelinesRendered,
  onToggleRubricSettings,
}: {
  csrfToken: string;
  modifiedAt: string;
  submissionId: string;
  maxAutoPoints: number;
  maxManualPoints: number;
  maxPoints: number;
  initialAutoPoints: number;
  initialManualPoints: number;
  submissionFeedback: string | null;
  rubricData: RubricData | null;
  rubricGrading: RubricGradingData | null;
  openIssues: { id: string; open: boolean | null }[];
  graders: StaffUser[] | null;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  disabled: boolean;
  skipText: string;
  context: 'main' | 'existing' | 'conflicting';
  showInstanceQuestionGroup: boolean;
  selectedInstanceQuestionGroupProp: StaffInstanceQuestionGroup | null;
  instanceQuestionGroups?: StaffInstanceQuestionGroup[];
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  graderGuidelinesRendered: string | null;
  onToggleRubricSettings?: () => void;
}) {
  const { watch, setValue, getValues } = useForm<GradingFormValues>({
    defaultValues: {
      autoPoints: initialAutoPoints,
      manualPoints: initialManualPoints,
      adjustPoints: rubricGrading?.adjust_points ?? 0,
      usePercentage:
        typeof window !== 'undefined'
          ? window.localStorage.getItem('manual_grading_score_use') === 'percentage'
          : false,
      selectedRubricItemIds: rubricGrading?.rubric_items
        ? Object.entries(rubricGrading.rubric_items)
            .filter(([, item]) => item.score)
            .map(([id]) => id)
        : [],
    },
  });

  const autoPoints = watch('autoPoints');
  const manualPoints = watch('manualPoints');
  const adjustPoints = watch('adjustPoints');
  const usePercentage = watch('usePercentage');
  const selectedRubricItemIds = watch('selectedRubricItemIds');
  const selectedItems = new Set(selectedRubricItemIds);

  const [adjustPointsShown, setAdjustPointsShown] = useState(
    !!rubricGrading?.adjust_points || disabled,
  );

  const [selectedGroup, setSelectedGroup] = useState<{
    id: string;
    assessment_question_id: string;
    instance_question_group_name: string;
    instance_question_group_description: string;
  } | null>(selectedInstanceQuestionGroupProp);

  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Compute rubric-derived manual points
  const computedManualPoints = run(() => {
    if (!rubricData) return manualPoints;

    const replaceAutoPoints = rubricData.rubric.replace_auto_points;
    const startingPoints = rubricData.rubric.starting_points;
    const itemsSum = rubricData.rubric_items
      .filter((item) => selectedItems.has(item.rubric_item.id))
      .reduce((sum, item) => sum + item.rubric_item.points, startingPoints);

    const maxAllowed = replaceAutoPoints ? maxPoints : maxManualPoints;
    const rubricValue =
      Math.min(
        Math.max(roundPoints(itemsSum), rubricData.rubric.min_points),
        maxAllowed + rubricData.rubric.max_extra_points,
      ) + adjustPoints;

    if (replaceAutoPoints) {
      return rubricValue - autoPoints;
    }
    return rubricValue;
  });

  const effectiveManualPoints = rubricData ? computedManualPoints : manualPoints;
  const totalPoints = roundPoints(autoPoints + effectiveManualPoints);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const el = feedbackRef.current;
    if (!el) return;
    el.style.height = '';
    if (el.scrollHeight) {
      const style = window.getComputedStyle(el);
      el.style.height =
        el.scrollHeight +
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        'px';
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight]);

  // Keyboard shortcuts for rubric items
  useEffect(() => {
    if (disabled || !rubricData) return;

    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement;
      if (
        ['TEXTAREA', 'SELECT'].includes(target.tagName) ||
        (target.tagName === 'INPUT' &&
          !['radio', 'button', 'submit', 'checkbox'].includes((target as HTMLInputElement).type)) ||
        target.isContentEditable
      ) {
        return;
      }

      const matchingItem = rubricData.rubric_items.find(
        (item) => item.rubric_item.key_binding === event.key,
      );
      if (matchingItem) {
        const current = getValues('selectedRubricItemIds');
        const id = matchingItem.rubric_item.id;
        if (current.includes(id)) {
          setValue(
            'selectedRubricItemIds',
            current.filter((x) => x !== id),
          );
        } else {
          setValue('selectedRubricItemIds', [...current, id]);
        }
      }
    };

    document.addEventListener('keypress', handler);
    return () => document.removeEventListener('keypress', handler);
  }, [disabled, rubricData, getValues, setValue]);

  // MathJax typesetting
  useEffect(() => {
    if (formRef.current) {
      void mathjaxTypeset([formRef.current]);
    }
  }, [rubricData]);

  const handlePointsChange = (
    type: 'manual' | 'auto',
    value: number,
    source: 'points' | 'percentage',
  ) => {
    const max = type === 'auto' ? maxAutoPoints : maxManualPoints;
    const pts = source === 'percentage' ? (value * max) / 100 : value;
    setValue(type === 'auto' ? 'autoPoints' : 'manualPoints', roundPoints(pts));
  };

  const handleAdjustPointsChange = (value: number, source: 'points' | 'percentage') => {
    const maxPts = maxManualPoints || maxPoints;
    setValue('adjustPoints', source === 'percentage' ? (value * maxPts) / 100 : value);
  };

  const handleToggleItem = (id: string) => {
    const current = getValues('selectedRubricItemIds');
    if (current.includes(id)) {
      setValue(
        'selectedRubricItemIds',
        current.filter((x) => x !== id),
      );
    } else {
      setValue('selectedRubricItemIds', [...current, id]);
    }
  };

  const handlePercentageToggle = (checked: boolean) => {
    setValue('usePercentage', checked);
    window.localStorage.setItem('manual_grading_score_use', checked ? 'percentage' : 'points');
  };

  const handleGroupSelect = async (group: {
    id: string | null;
    instance_question_group_name: string;
    instance_question_group_description: string;
  }) => {
    const previousGroup = selectedGroup;
    const newGroup = group.id
      ? {
          id: group.id,
          assessment_question_id: '',
          instance_question_group_name: group.instance_question_group_name,
          instance_question_group_description: group.instance_question_group_description,
        }
      : null;
    setSelectedGroup(newGroup);

    try {
      const response = await fetch('./manual_instance_question_group', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ manualInstanceQuestionGroupId: group.id }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update group: ${response.statusText}`);
      }
    } catch {
      setSelectedGroup(previousGroup);
    }
  };

  const showSkipGradedSubmissionsButton = !disabled && context === 'main';
  const showAssignedToMeButton = !disabled && context === 'main';

  const emptyGroup = {
    id: null as string | null,
    instance_question_group_name: 'No group',
    instance_question_group_description: 'No group assigned.',
  };

  const displayedSelectedGroup = selectedGroup
    ? {
        id: selectedGroup.id as string | null,
        instance_question_group_name: selectedGroup.instance_question_group_name,
        instance_question_group_description: selectedGroup.instance_question_group_description,
      }
    : emptyGroup;

  const instanceQuestionGroupsWithEmpty = instanceQuestionGroups
    ? [
        ...instanceQuestionGroups.map((g) => ({
          id: g.id as string | null,
          instance_question_group_name: g.instance_question_group_name,
          instance_question_group_description: g.instance_question_group_description,
        })),
        emptyGroup,
      ]
    : [emptyGroup];

  const maxPointsForPercentage = maxManualPoints || maxPoints;
  const showRubricInManualSection =
    rubricData && (!rubricData.rubric.replace_auto_points || (!maxAutoPoints && !autoPoints));
  const showRubricInTotalSection = rubricData?.rubric.replace_auto_points;
  const hasAutoPoints = maxAutoPoints > 0 || autoPoints > 0;

  return (
    <form ref={formRef} name="manual-grading-form" method="POST">
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="modified_at" value={modifiedAt} />
      <input type="hidden" name="submission_id" value={submissionId} />
      {/* Hidden inputs for computed values when rubric is active */}
      {rubricData && (
        <>
          <input
            type="hidden"
            name="score_manual_points"
            value={roundPoints(effectiveManualPoints)}
          />
          <input type="hidden" name="score_manual_adjust_points" value={adjustPoints} />
        </>
      )}
      <ul className="list-group list-group-flush">
        {maxPoints > 0 && (
          <li className="list-group-item d-flex justify-content-center">
            <span>Points</span>
            <div className="form-check form-switch mx-2">
              <input
                className="form-check-input"
                name="use_score_perc"
                id={`use-score-perc-${context}`}
                type="checkbox"
                checked={usePercentage}
                onChange={(e) => handlePercentageToggle(e.target.checked)}
              />
              <label className="form-check-label" htmlFor={`use-score-perc-${context}`}>
                Percentage
              </label>
            </div>
          </li>
        )}
        {showInstanceQuestionGroup && context === 'main' && (
          <li className="list-group-item align-items-center">
            <label className="form-label d-flex align-items-center gap-2">
              Submission Group:
              {instanceQuestionGroups && instanceQuestionGroups.length > 0 && (
                <OverlayTrigger
                  tooltip={{
                    body: (
                      <span
                        // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
                        dangerouslySetInnerHTML={{
                          __html: displayedSelectedGroup.instance_question_group_description,
                        }}
                      />
                    ),
                    props: { id: 'tooltip-submission-group-info' },
                  }}
                >
                  <div>
                    <i className="fas fa-circle-info text-secondary" />
                  </div>
                </OverlayTrigger>
              )}
            </label>
            <Dropdown className="w-100 mb-2">
              <Dropdown.Toggle
                variant="outline-secondary"
                className="d-flex justify-content-between align-items-center w-100 border border-gray bg-white"
                aria-label="Change selected submission group"
              >
                {displayedSelectedGroup.instance_question_group_name}
              </Dropdown.Toggle>
              <Dropdown.Menu style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                {instanceQuestionGroupsWithEmpty.map((group, idx) => {
                  const isSelected = displayedSelectedGroup.id === group.id;
                  return (
                    <Dropdown.Item
                      key={group.id ?? `empty-${idx}`}
                      active={isSelected}
                      onClick={() => handleGroupSelect(group)}
                    >
                      {group.instance_question_group_name}
                    </Dropdown.Item>
                  );
                })}
              </Dropdown.Menu>
            </Dropdown>
          </li>
        )}
        {graderGuidelinesRendered && (
          <li className="list-group-item">
            <div className="mb-1">Guidelines:</div>
            <p
              className="my-3"
              style={{ whiteSpace: 'pre-line' }}
              // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
              dangerouslySetInnerHTML={{ __html: graderGuidelinesRendered }}
            />
          </li>
        )}
        <li className="list-group-item">
          <GradingPointsInput
            type="manual"
            typeLabel="Manual"
            context={context}
            disabled={disabled}
            points={roundPoints(effectiveManualPoints)}
            maxPoints={maxManualPoints}
            showPercentage={maxPoints > 0}
            showInput={!rubricData}
            showInputEdit={false}
            showRubricButton={
              context === 'main' && !rubricData?.rubric.replace_auto_points && !disabled
            }
            usePercentage={usePercentage}
            onPointsChange={(val, source) => handlePointsChange('manual', val, source)}
            onToggleRubricSettings={onToggleRubricSettings}
          />
          {showRubricInManualSection && (
            <RubricInputSection
              rubricData={rubricData}
              disabled={disabled}
              aiGradingInfo={aiGradingInfo}
              maxPointsForPercentage={maxPointsForPercentage}
              usePercentage={usePercentage}
              selectedItems={selectedItems}
              adjustPoints={adjustPoints}
              adjustPointsShown={adjustPointsShown}
              onToggleItem={handleToggleItem}
              onAdjustPointsChange={handleAdjustPointsChange}
              onShowAdjustPoints={() => setAdjustPointsShown(true)}
            />
          )}
        </li>
        {hasAutoPoints && (
          <>
            <li className="list-group-item">
              <GradingPointsInput
                type="auto"
                typeLabel="Auto"
                context={context}
                disabled={disabled}
                points={autoPoints}
                maxPoints={maxAutoPoints}
                showPercentage={maxPoints > 0}
                showInput={false}
                showInputEdit={!disabled}
                showRubricButton={false}
                usePercentage={usePercentage}
                onPointsChange={(val, source) => handlePointsChange('auto', val, source)}
              />
            </li>
            <li className="list-group-item">
              <TotalPointsDisplay
                totalPoints={totalPoints}
                maxPoints={maxPoints}
                usePercentage={usePercentage}
                disabled={disabled}
                showRubricButton={!!showRubricInTotalSection}
                onToggleRubricSettings={onToggleRubricSettings}
              />
              {showRubricInTotalSection && (
                <RubricInputSection
                  rubricData={rubricData}
                  disabled={disabled}
                  aiGradingInfo={aiGradingInfo}
                  maxPointsForPercentage={maxPointsForPercentage}
                  usePercentage={usePercentage}
                  selectedItems={selectedItems}
                  adjustPoints={adjustPoints}
                  adjustPointsShown={adjustPointsShown}
                  onToggleItem={handleToggleItem}
                  onAdjustPointsChange={handleAdjustPointsChange}
                  onShowAdjustPoints={() => setAdjustPointsShown(true)}
                />
              )}
            </li>
          </>
        )}
        <li className="list-group-item">
          <label>
            Feedback:
            <textarea
              ref={feedbackRef}
              name="submission_note"
              className="form-control"
              style={{ minHeight: '1em' }}
              readOnly={disabled}
              defaultValue={submissionFeedback ?? ''}
              aria-describedby={`submission-feedback-help-${context}`}
              onInput={adjustTextareaHeight}
            />
            <small id={`submission-feedback-help-${context}`} className="form-text text-muted">
              Markdown formatting, such as *<em>emphasis</em>* or &#96;<code>code</code>&#96;, is
              permitted and will be used to format the feedback when presented to the student.
            </small>
          </label>
        </li>
        {openIssues.length > 0 && context !== 'existing' && (
          <li className="list-group-item">
            {openIssues.map((issue) => (
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
        )}
        <li className="list-group-item d-flex align-items-center justify-content-end flex-wrap gap-2">
          <div>
            <div className="form-check">
              {showSkipGradedSubmissionsButton ? (
                <>
                  <input
                    id={`skip_graded_submissions_${context}`}
                    type="checkbox"
                    className="form-check-input"
                    name="skip_graded_submissions"
                    value="true"
                    defaultChecked={skipGradedSubmissions}
                  />
                  <label
                    className="form-check-label"
                    htmlFor={`skip_graded_submissions_${context}`}
                  >
                    Skip graded submissions
                  </label>
                </>
              ) : (
                <input
                  type="hidden"
                  name="skip_graded_submissions"
                  value={skipGradedSubmissions ? 'true' : 'false'}
                />
              )}
            </div>
            <div className="form-check">
              {showAssignedToMeButton ? (
                <>
                  <input
                    id={`show_submissions_assigned_to_me_only_${context}`}
                    type="checkbox"
                    className="form-check-input"
                    name="show_submissions_assigned_to_me_only"
                    value="true"
                    defaultChecked={showSubmissionsAssignedToMeOnly}
                  />
                  <label
                    className="form-check-label"
                    htmlFor={`show_submissions_assigned_to_me_only_${context}`}
                  >
                    Skip submissions not assigned to me
                  </label>
                </>
              ) : (
                <input
                  type="hidden"
                  name="show_submissions_assigned_to_me_only"
                  value={showSubmissionsAssignedToMeOnly ? 'true' : 'false'}
                />
              )}
            </div>
          </div>
          <span className="ms-auto">
            {!disabled && (
              <>
                {context === 'main' && (
                  <Dropdown
                    as="div"
                    className={`btn-group ${selectedGroup ? '' : 'd-none'}`}
                    style={{ display: 'inline-flex' }}
                  >
                    <button
                      type="submit"
                      className="btn btn-primary"
                      name="__action"
                      value="add_manual_grade"
                    >
                      Grade
                    </button>
                    <Dropdown.Toggle variant="primary" split />
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
                      <Dropdown.ItemText className="text-muted small">
                        AI can make mistakes. Review submission group assignments before grading.
                      </Dropdown.ItemText>
                    </Dropdown.Menu>
                  </Dropdown>
                )}
                <button
                  id="grade-button"
                  type="submit"
                  className={`btn btn-primary ${selectedGroup ? 'd-none' : ''}`}
                  name="__action"
                  value="add_manual_grade"
                >
                  Grade
                </button>
              </>
            )}
            <Dropdown as="div" className="btn-group">
              <button
                type="submit"
                className="btn btn-secondary"
                name="__action"
                value="next_instance_question"
              >
                {skipText}
              </button>
              {!disabled && (
                <>
                  <Dropdown.Toggle variant="secondary" aria-label="Change assigned grader" split />
                  <Dropdown.Menu align="end">
                    {(graders || []).map((grader) => (
                      <Dropdown.Item
                        key={grader.id}
                        as="button"
                        type="submit"
                        name="__action"
                        value={`reassign_${grader.id}`}
                      >
                        Assign to: {grader.name} ({grader.uid})
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
          </span>
        </li>
      </ul>
    </form>
  );
}
