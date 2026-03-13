import { useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import { mathjaxTypeset } from '../../../lib/client/mathjax.js';
import type { StaffInstanceQuestionGroup, StaffUser } from '../../../lib/client/safe-db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

interface RubricGradingProps {
  adjust_points: number;
  rubric_items: Record<string, { score: number }> | null;
}

interface ConflictGradingJobProps {
  grader_name: string | null;
  auto_points: number | null;
  manual_points: number | null;
  score: number | null;
  feedback: Record<string, any> | null;
  rubric_grading: RubricGradingProps | null;
}

interface GradingPanelProps {
  csrfToken: string;
  modifiedAt: string;
  submissionId: string;
  instanceQuestionId: string;
  maxAutoPoints: number;
  maxManualPoints: number;
  maxPoints: number;
  autoPoints: number;
  manualPoints: number;
  totalPoints: number;
  submissionFeedback: string | null;
  rubricData: RubricData | null;
  rubricGrading: RubricGradingProps | null;
  openIssues: { id: string; open: boolean | null }[];
  graders: StaffUser[] | null;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  hasEditPermission: boolean;
  showInstanceQuestionGroup: boolean;
  selectedInstanceQuestionGroup: StaffInstanceQuestionGroup | null;
  instanceQuestionGroups?: StaffInstanceQuestionGroup[];
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  onToggleRubricSettings?: () => void;
  graderGuidelinesRendered: string | null;
  conflictGradingJob: ConflictGradingJobProps | null;
  conflictGradingJobDateFormatted: string | null;
  conflictLastGraderName: string | null;
  existingDateFormatted: string | null;
  displayTimezone: string;
}

function roundPoints(points: number): number {
  return Math.round(Number(points) * 100) / 100;
}

function GradingPointsInput({
  type,
  typeLabel,
  context,
  showInput,
  points,
  maxPoints,
  showPercentage,
  disabled,
  showInputEdit,
  showRubricButton,
  usePercentage,
  onPointsChange,
  onToggleRubricSettings,
}: {
  type: 'manual' | 'auto';
  typeLabel: string;
  context: string;
  showInput: boolean;
  points: number;
  maxPoints: number;
  showPercentage: boolean;
  disabled: boolean;
  showInputEdit: boolean;
  showRubricButton: boolean;
  usePercentage: boolean;
  onPointsChange?: (points: number, source: 'points' | 'percentage') => void;
  onToggleRubricSettings?: () => void;
}) {
  const [editEnabled, setEditEnabled] = useState(false);
  const percentage = maxPoints ? roundPoints((points * 100) / maxPoints) : 0;

  return (
    <div className="mb-3">
      <span className="w-100">
        {!usePercentage && (
          <label htmlFor={`${type}-score-value-input-points-${context}`}>{typeLabel} Points:</label>
        )}
        {showPercentage && usePercentage && (
          <label htmlFor={`${type}-score-value-input-percentage-${context}`}>
            {typeLabel} Score:
          </label>
        )}
        <span className="float-end">
          {!showInput && !editEnabled && (
            <>
              {!usePercentage && (
                <span>
                  <span>{roundPoints(points)}</span> / {maxPoints}
                </span>
              )}
              {showPercentage && usePercentage && <span>{percentage}%</span>}
            </>
          )}
          <div className="btn-group btn-group-sm" role="group">
            {showInputEdit && !editEnabled && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setEditEnabled(true)}
              >
                <i className="fas fa-pencil" />
              </button>
            )}
            {showRubricButton && onToggleRubricSettings && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onToggleRubricSettings}
              >
                <i className="fas fa-list-check" /> Rubric
              </button>
            )}
          </div>
        </span>
      </span>
      {!usePercentage && (showInput || editEnabled) && (
        <div className="input-group">
          <input
            type="number"
            step="any"
            id={`${type}-score-value-input-points-${context}`}
            className="form-control"
            name={`score_${type}_points`}
            value={roundPoints(points)}
            disabled={disabled}
            required
            onChange={(e) => onPointsChange?.(Number(e.target.value), 'points')}
          />
          <span className="input-group-text">/ {maxPoints}</span>
        </div>
      )}
      {showPercentage && usePercentage && (showInput || editEnabled) && (
        <div className="input-group">
          <input
            type="number"
            step="any"
            id={`${type}-score-value-input-percentage-${context}`}
            className="form-control"
            name={`score_${type}_percent`}
            value={percentage}
            disabled={disabled}
            required
            onChange={(e) => onPointsChange?.(Number(e.target.value), 'percentage')}
          />
          <span className="input-group-text">%</span>
        </div>
      )}
    </div>
  );
}

function TotalPointsDisplay({
  totalPoints,
  maxPoints,
  usePercentage,
  disabled,
  showRubricButton,
  onToggleRubricSettings,
}: {
  totalPoints: number;
  maxPoints: number;
  usePercentage: boolean;
  disabled: boolean;
  showRubricButton: boolean;
  onToggleRubricSettings?: () => void;
}) {
  const percentage = maxPoints ? roundPoints((totalPoints * 100) / maxPoints) : 0;
  return (
    <>
      {showRubricButton && !disabled && onToggleRubricSettings && (
        <span className="float-end btn-group btn-group-sm ms-1" role="group">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onToggleRubricSettings}
          >
            <i className="fas fa-list-check" /> Rubric
          </button>
        </span>
      )}
      {!usePercentage && (
        <div className="mb-3 w-100">
          Total Points:
          <span className="float-end">
            {roundPoints(totalPoints)} / {maxPoints}
          </span>
        </div>
      )}
      {maxPoints > 0 && usePercentage && (
        <div className="mb-3 w-100">
          Total Score:
          <span className="float-end">{percentage}%</span>
        </div>
      )}
    </>
  );
}

function RubricItemCheckbox({
  item,
  maxPointsForPercentage,
  disabled,
  aiChecked,
  usePercentage,
  checked,
  onToggle,
}: {
  item: RubricData['rubric_items'][0];
  maxPointsForPercentage: number;
  disabled: boolean;
  aiChecked?: boolean;
  usePercentage: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const points = item.rubric_item.points;
  const percentage = maxPointsForPercentage
    ? roundPoints((points * 100) / maxPointsForPercentage)
    : 0;

  return (
    <div>
      <label
        className="w-100"
        style={{
          borderColor: 'rgba(0, 0, 0, 0)',
          borderWidth: '1px',
          borderStyle: 'solid',
          ...(checked
            ? { borderColor: 'rgba(0, 0, 0, 0.125)', backgroundColor: 'var(--light)' }
            : {}),
        }}
      >
        {aiChecked !== undefined && (
          <OverlayTrigger
            placement="top"
            tooltip={{
              body: aiChecked ? 'Selected by AI' : 'Not selected by AI',
              props: { id: `tooltip-ai-checked-${item.rubric_item.id}` },
            }}
          >
            <input
              type="checkbox"
              style={{ marginLeft: '3px', marginRight: '8px' }}
              checked={aiChecked}
              disabled
            />
          </OverlayTrigger>
        )}
        <input
          type="checkbox"
          name="rubric_item_selected_manual"
          className="me-2"
          value={item.rubric_item.id}
          checked={checked}
          disabled={disabled}
          data-key-binding={item.rubric_item.key_binding}
          onChange={() => onToggle(item.rubric_item.id)}
        />
        <span className="badge text-bg-info">{item.rubric_item.key_binding}</span>
        <span className={`float-end text-${points >= 0 ? 'success' : 'danger'}`}>
          <strong>
            {!usePercentage && (
              <span data-testid="rubric-item-points">
                [{(points >= 0 ? '+' : '') + roundPoints(points)}]
              </span>
            )}
            {maxPointsForPercentage > 0 && usePercentage && (
              <span>[{(points >= 0 ? '+' : '') + percentage}%]</span>
            )}
          </strong>
        </span>
        <span>
          <div
            className="d-inline-block"
            data-testid="rubric-item-description"
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{ __html: item.description_rendered ?? '' }}
          />
          <div
            className="small text-muted"
            data-testid="rubric-item-explanation"
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{ __html: item.explanation_rendered ?? '' }}
          />
          <div
            className="small text-muted"
            data-testid="rubric-item-grader-note"
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{ __html: item.grader_note_rendered ?? '' }}
          />
        </span>
      </label>
    </div>
  );
}

function RubricInputSection({
  rubricData,
  disabled,
  aiGradingInfo,
  maxPointsForPercentage,
  usePercentage,
  selectedItems,
  onToggleItem,
  adjustPoints,
  adjustPointsShown,
  onAdjustPointsChange,
  onShowAdjustPoints,
}: {
  rubricData: RubricData;
  disabled: boolean;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  maxPointsForPercentage: number;
  usePercentage: boolean;
  selectedItems: Set<string>;
  onToggleItem: (id: string) => void;
  adjustPoints: number;
  adjustPointsShown: boolean;
  onAdjustPointsChange: (points: number, source: 'points' | 'percentage') => void;
  onShowAdjustPoints: () => void;
}) {
  const aiSelectedIds = aiGradingInfo?.submissionManuallyGraded
    ? new Set(aiGradingInfo.selectedRubricItemIds)
    : null;

  const adjustPercentage = maxPointsForPercentage
    ? roundPoints((adjustPoints * 100) / maxPointsForPercentage)
    : 0;

  return (
    <>
      {aiGradingInfo?.submissionManuallyGraded && (
        <div
          className="d-flex align-items-center gap-2 text-secondary mb-1"
          style={{ paddingLeft: '3px' }}
        >
          <OverlayTrigger
            tooltip={{ body: 'AI grading', props: { id: 'tooltip-ai-grading-icon' } }}
          >
            <div>
              <i className="bi bi-stars" />
            </div>
          </OverlayTrigger>
          <OverlayTrigger
            tooltip={{ body: 'Manual grading', props: { id: 'tooltip-manual-grading-icon' } }}
          >
            <div>
              <i className="bi bi-person-fill" />
            </div>
          </OverlayTrigger>
        </div>
      )}
      {rubricData.rubric_items.map((item) => (
        <RubricItemCheckbox
          key={item.rubric_item.id}
          item={item}
          maxPointsForPercentage={maxPointsForPercentage}
          disabled={disabled}
          aiChecked={aiSelectedIds ? aiSelectedIds.has(item.rubric_item.id) : undefined}
          usePercentage={usePercentage}
          checked={selectedItems.has(item.rubric_item.id)}
          onToggle={onToggleItem}
        />
      ))}
      <div className="d-flex justify-content-end">
        {!adjustPointsShown && !disabled && (
          <button type="button" className="btn btn-sm btn-link" onClick={onShowAdjustPoints}>
            Apply adjustment
          </button>
        )}
        {adjustPointsShown && (
          <div className="w-25">
            <label>
              <span className="small">Adjustment:</span>
              {!usePercentage && (
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={adjustPoints || ''}
                    disabled={disabled}
                    onChange={(e) => onAdjustPointsChange(Number(e.target.value), 'points')}
                  />
                </div>
              )}
              {maxPointsForPercentage > 0 && usePercentage && (
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={adjustPercentage || ''}
                    disabled={disabled}
                    onChange={(e) => onAdjustPointsChange(Number(e.target.value), 'percentage')}
                  />
                  <span className="input-group-text">%</span>
                </div>
              )}
            </label>
          </div>
        )}
      </div>
    </>
  );
}

interface GradingFormValues {
  autoPoints: number;
  manualPoints: number;
  adjustPoints: number;
  usePercentage: boolean;
  selectedRubricItemIds: string[];
}

function GradingForm({
  csrfToken,
  modifiedAt,
  submissionId,
  instanceQuestionId,
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
  instanceQuestionId: string;
  maxAutoPoints: number;
  maxManualPoints: number;
  maxPoints: number;
  initialAutoPoints: number;
  initialManualPoints: number;
  submissionFeedback: string | null;
  rubricData: RubricData | null;
  rubricGrading: RubricGradingProps | null;
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

  useEffect(() => {
    setValue('adjustPoints', rubricGrading?.adjust_points ?? 0);
    setValue(
      'selectedRubricItemIds',
      rubricGrading?.rubric_items
        ? Object.entries(rubricGrading.rubric_items)
            .filter(([, item]) => item.score)
            .map(([id]) => id)
        : [],
    );
  }, [rubricGrading, setValue]);

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
      const response = await fetch(`${instanceQuestionId}/manual_instance_question_group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

export function InstanceQuestionGradingPanel(props: GradingPanelProps) {
  const {
    csrfToken,
    modifiedAt,
    submissionId,
    instanceQuestionId,
    maxAutoPoints,
    maxManualPoints,
    maxPoints,
    autoPoints,
    manualPoints,
    submissionFeedback,
    openIssues,
    graders,
    aiGradingInfo,
    hasEditPermission,
    showInstanceQuestionGroup,
    selectedInstanceQuestionGroup,
    instanceQuestionGroups,
    skipGradedSubmissions,
    showSubmissionsAssignedToMeOnly: showSubmissionsAssignedToMeOnlyProp,
    graderGuidelinesRendered,
    onToggleRubricSettings,
    conflictGradingJob,
    conflictGradingJobDateFormatted,
    conflictLastGraderName,
    existingDateFormatted,
  } = props;

  const { rubricData } = props;
  const rubricGrading = props.rubricGrading;

  const disabled = !hasEditPermission;
  const showSubmissionsAssignedToMeOnly = !hasEditPermission
    ? false
    : showSubmissionsAssignedToMeOnlyProp;

  const [showConflictModal, setShowConflictModal] = useState(!!conflictGradingJob);

  return (
    <>
      <GradingForm
        csrfToken={csrfToken}
        modifiedAt={modifiedAt}
        submissionId={submissionId}
        instanceQuestionId={instanceQuestionId}
        maxAutoPoints={maxAutoPoints}
        maxManualPoints={maxManualPoints}
        maxPoints={maxPoints}
        initialAutoPoints={autoPoints}
        initialManualPoints={manualPoints}
        submissionFeedback={submissionFeedback}
        rubricData={rubricData}
        rubricGrading={rubricGrading}
        openIssues={openIssues}
        graders={graders}
        aiGradingInfo={aiGradingInfo}
        disabled={disabled}
        skipText="Next"
        context="main"
        showInstanceQuestionGroup={showInstanceQuestionGroup}
        selectedInstanceQuestionGroupProp={selectedInstanceQuestionGroup}
        instanceQuestionGroups={instanceQuestionGroups}
        skipGradedSubmissions={skipGradedSubmissions}
        showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
        graderGuidelinesRendered={graderGuidelinesRendered}
        onToggleRubricSettings={onToggleRubricSettings}
      />

      {conflictGradingJob && (
        <Modal show={showConflictModal} size="xl" onHide={() => setShowConflictModal(false)}>
          <Modal.Header className="bg-danger text-light" closeButton>
            <Modal.Title>Grading conflict identified</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="alert alert-danger" role="alert">
              The submission you have just graded has already been graded by{' '}
              {conflictLastGraderName ?? 'an unknown grader'}. Your score and feedback have not been
              applied. Please review the feedback below and select how you would like to proceed.
            </div>
            <div className="row mb-2">
              <div className="col-lg-6 col-12">
                <div>
                  <strong>Existing score and feedback</strong>
                </div>
                <div className="mb-2">
                  {existingDateFormatted}, by {conflictLastGraderName ?? 'an unknown grader'}
                </div>
                <div className="card">
                  <GradingForm
                    csrfToken={csrfToken}
                    modifiedAt={modifiedAt}
                    submissionId={submissionId}
                    instanceQuestionId={instanceQuestionId}
                    maxAutoPoints={maxAutoPoints}
                    maxManualPoints={maxManualPoints}
                    maxPoints={maxPoints}
                    initialAutoPoints={autoPoints}
                    initialManualPoints={manualPoints}
                    submissionFeedback={submissionFeedback}
                    rubricData={rubricData}
                    rubricGrading={rubricGrading}
                    openIssues={openIssues}
                    graders={null}
                    disabled={true}
                    skipText="Accept existing score"
                    context="existing"
                    showInstanceQuestionGroup={false}
                    selectedInstanceQuestionGroupProp={null}
                    skipGradedSubmissions={skipGradedSubmissions}
                    showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
                    graderGuidelinesRendered={null}
                  />
                </div>
              </div>
              <div className="col-lg-6 col-12">
                <div>
                  <strong>Conflicting score and feedback</strong>
                </div>
                <div className="mb-2">
                  {conflictGradingJobDateFormatted ? `${conflictGradingJobDateFormatted}, ` : ''}
                  by {conflictGradingJob.grader_name}
                </div>
                <div className="card">
                  <GradingForm
                    csrfToken={csrfToken}
                    modifiedAt={modifiedAt}
                    submissionId={submissionId}
                    instanceQuestionId={instanceQuestionId}
                    maxAutoPoints={maxAutoPoints}
                    maxManualPoints={maxManualPoints}
                    maxPoints={maxPoints}
                    initialAutoPoints={conflictGradingJob.auto_points ?? 0}
                    initialManualPoints={conflictGradingJob.manual_points ?? 0}
                    submissionFeedback={conflictGradingJob.feedback?.manual ?? null}
                    rubricData={rubricData}
                    rubricGrading={conflictGradingJob.rubric_grading}
                    openIssues={openIssues}
                    graders={graders}
                    disabled={false}
                    skipText="Next"
                    context="conflicting"
                    showInstanceQuestionGroup={false}
                    selectedInstanceQuestionGroupProp={null}
                    skipGradedSubmissions={skipGradedSubmissions}
                    showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
                    graderGuidelinesRendered={null}
                  />
                </div>
              </div>
            </div>
          </Modal.Body>
        </Modal>
      )}
    </>
  );
}
