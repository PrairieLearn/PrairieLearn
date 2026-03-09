import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import clsx from 'clsx';
import { type ReactElement, useId } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import { CopyButton } from '../../../../components/CopyButton.js';
import { HistMini } from '../../../../components/HistMini.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import { getQuestionUrl } from '../../../../lib/client/url.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { QuestionAlternativeForm, TreeState, ZoneQuestionBlockForm } from '../../types.js';
import {
  compactPoints,
  computeQuestionTotalPoints,
  toAssessmentForPicker,
} from '../../utils/questions.js';
import { AssessmentBadges } from '../AssessmentBadges.js';

import { ChangeIndicatorBadges } from './ChangeIndicatorBadges.js';
import { DragHandle } from './DragHandle.js';

export function PointsBadge({
  question,
  zoneQuestionBlock,
  assessmentType,
  gradingMethod,
}: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  assessmentType: EnumAssessmentType;
  gradingMethod?: string;
}): ReactElement | null {
  const tooltipId = useId();
  const forceMax = question.forceMaxPoints ?? zoneQuestionBlock.forceMaxPoints;
  const rawAutoPoints =
    question.points ??
    question.autoPoints ??
    zoneQuestionBlock.points ??
    zoneQuestionBlock.autoPoints;
  const rawManualPoints = question.manualPoints ?? zoneQuestionBlock.manualPoints;

  // When the question uses manual grading, `points`/`autoPoints` in the JSON
  // actually represent manual points, not auto points.
  const isManualGrading = gradingMethod === 'Manual';
  const autoPoints = isManualGrading ? undefined : rawAutoPoints;
  const manualPoints = isManualGrading ? (rawAutoPoints ?? rawManualPoints) : rawManualPoints;

  if (assessmentType === 'Exam') {
    if (autoPoints == null && manualPoints == null) return null;

    if (forceMax) {
      const total = computeQuestionTotalPoints(question, assessmentType, zoneQuestionBlock);
      return (
        <OverlayTrigger
          placement="top"
          tooltip={{
            props: { id: tooltipId },
            body: `Force max points: student receives ${total} pts on regrade`,
          }}
        >
          <span className="text-muted small text-nowrap ms-2">
            <i className="bi bi-pin-angle-fill me-1" aria-hidden="true" />
            {total}
          </span>
        </OverlayTrigger>
      );
    }

    const compactParts: ReactElement[] = [];
    const tooltipParts: string[] = [];

    if (manualPoints != null) {
      const manualStr = String(manualPoints);
      compactParts.push(
        <span key="manual">
          <i className="bi bi-person-fill me-1" aria-hidden="true" />
          {manualStr}
        </span>,
      );
      tooltipParts.push(`Manual grading: ${manualStr} pts`);
    }

    if (autoPoints != null) {
      const pts = Array.isArray(autoPoints) ? autoPoints : [autoPoints];
      if (compactParts.length > 0) {
        compactParts.push(<span key="sep"> + </span>);
      }
      compactParts.push(
        <span key="auto">
          <i className="bi bi-lightning-charge-fill me-1" aria-hidden="true" />
          {compactPoints(pts)}
        </span>,
      );
      tooltipParts.push(
        pts.length > 1
          ? `Auto-graded: ${pts.join(', ')} pts (per variant)`
          : `Auto-graded: ${pts[0]} pts`,
      );
    }

    return (
      <OverlayTrigger
        placement="top"
        tooltip={{ props: { id: tooltipId }, body: tooltipParts.join(' · ') }}
      >
        <span className="text-muted small text-nowrap ms-2">{compactParts}</span>
      </OverlayTrigger>
    );
  }

  // Homework
  const initPoints = Array.isArray(autoPoints) ? autoPoints[0] : autoPoints;
  const maxAutoPoints =
    question.maxPoints ??
    question.maxAutoPoints ??
    zoneQuestionBlock.maxPoints ??
    zoneQuestionBlock.maxAutoPoints ??
    autoPoints;
  const maxAuto = Array.isArray(maxAutoPoints) ? maxAutoPoints[0] : maxAutoPoints;

  if (initPoints == null && maxAuto == null && manualPoints == null) return null;

  if (forceMax) {
    const total = computeQuestionTotalPoints(question, assessmentType, zoneQuestionBlock);
    return (
      <OverlayTrigger
        placement="top"
        tooltip={{
          props: { id: tooltipId },
          body: `Force max points: student receives ${total} pts on regrade`,
        }}
      >
        <span className="text-muted small text-nowrap ms-2">
          <i className="bi bi-pin-angle-fill me-1" aria-hidden="true" />
          {total}
        </span>
      </OverlayTrigger>
    );
  }

  const compactParts: ReactElement[] = [];
  const tooltipParts: string[] = [];

  if (manualPoints != null) {
    const manualStr = String(manualPoints);
    compactParts.push(
      <span key="manual">
        <i className="bi bi-person-fill me-1" aria-hidden="true" />
        {manualStr}
      </span>,
    );
    tooltipParts.push(`Manual grading: ${manualStr} pts`);
  }

  if (initPoints != null || maxAuto != null) {
    const init = initPoints ?? 0;
    const max = maxAuto ?? 0;
    if (compactParts.length > 0) {
      compactParts.push(<span key="sep"> + </span>);
    }
    compactParts.push(
      <span key="auto">
        <i className="bi bi-lightning-charge-fill me-1" aria-hidden="true" />
        {init === max ? init : `${init}/${max}`}
      </span>,
    );
    tooltipParts.push(
      init === max
        ? `Auto-graded: ${init} pts`
        : `Auto-graded: ${init} pts initial, ${max} pts max`,
    );
  }

  return (
    <OverlayTrigger
      placement="top"
      tooltip={{ props: { id: tooltipId }, body: tooltipParts.join(' · ') }}
    >
      <span className="text-muted small text-nowrap ms-2">{compactParts}</span>
    </OverlayTrigger>
  );
}

export function TreeQuestionRow({
  question,
  zoneQuestionBlock,
  isAlternative,
  questionData,
  state,
  isSelected,
  draggableAttributes,
  draggableListeners,
  onClick,
  onDelete,
}: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  isAlternative: boolean;
  questionData: StaffAssessmentQuestionRow | null;
  state: TreeState;
  isSelected: boolean;
  draggableAttributes: DraggableAttributes;
  draggableListeners: DraggableSyntheticListeners;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const {
    editMode,
    viewType,
    changeTracking,
    courseInstanceId,
    hasCoursePermissionPreview,
    assessmentType,
  } = state;
  const indent = isAlternative ? '4.5rem' : '2.5rem';

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(
        'tree-row d-flex align-items-center py-1 border-bottom',
        isSelected ? 'tree-row-selected' : 'list-group-item-action',
      )}
      style={{ paddingLeft: indent, paddingRight: '0.5rem', cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <DragHandle
        attributes={draggableAttributes}
        listeners={draggableListeners}
        disabled={!editMode}
      />
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="text-truncate">
          {questionData ? (
            hasCoursePermissionPreview ? (
              <>
                <a
                  href={getQuestionUrl({ courseInstanceId, questionId: questionData.question.id })}
                  className="link-underline-opacity-0 link-underline-opacity-100-hover text-primary-emphasis"
                  onClick={(e) => e.stopPropagation()}
                >
                  {questionData.question.title}
                </a>
              </>
            ) : (
              questionData.question.title
            )
          ) : (
            <span className="text-muted small">{question.id}</span>
          )}
          <ChangeIndicatorBadges
            trackingId={question.trackingId}
            comment={question.comment}
            editMode={editMode}
            changeTracking={changeTracking}
          />
        </div>
        {question.id && (
          <div
            className="d-flex align-items-center text-muted font-monospace"
            style={{ fontSize: '0.75rem' }}
          >
            <span className="text-truncate">{question.id}</span>
            <CopyButton
              text={question.id}
              tooltipId={`copy-qid-${question.id}`}
              ariaLabel="Copy QID"
              className="hover-show ms-1"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {viewType === 'detailed' && questionData && (
          <>
            {(questionData.tags?.length ||
              questionData.assessment_question.number_submissions_hist) && (
              <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                {questionData.tags?.map((tag) => (
                  <span key={tag.name} className={`badge color-${tag.color}`}>
                    {tag.name}
                  </span>
                ))}
                {questionData.assessment_question.number_submissions_hist && (
                  <HistMini
                    data={questionData.assessment_question.number_submissions_hist}
                    options={{ width: 60, height: 20 }}
                  />
                )}
              </div>
            )}
            {questionData.other_assessments && questionData.other_assessments.length > 0 && (
              <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                <AssessmentBadges
                  assessments={toAssessmentForPicker(questionData.other_assessments)}
                  courseInstanceId={courseInstanceId}
                />
              </div>
            )}
          </>
        )}
      </div>
      {questionData && (
        <div className="ms-2 me-2">
          <span className={`badge color-${questionData.topic.color}`}>
            {questionData.topic.name}
          </span>
        </div>
      )}
      <div className="flex-shrink-0 text-end" style={{ minWidth: '6rem' }}>
        <PointsBadge
          question={question}
          zoneQuestionBlock={zoneQuestionBlock}
          assessmentType={assessmentType}
          gradingMethod={questionData?.question.grading_method}
        />
      </div>
      {editMode && onDelete && (
        <button
          type="button"
          className="btn btn-sm border-0 text-muted ms-1 tree-delete-btn hover-show"
          aria-label={`Delete ${question.id ?? 'question'}`}
          title="Delete question"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <i className="bi bi-trash3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
