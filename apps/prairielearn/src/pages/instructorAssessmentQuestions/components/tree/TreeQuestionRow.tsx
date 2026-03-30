import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import clsx from 'clsx';
import { type ReactElement, useId } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { AssessmentQuestionNumber } from '../../../../components/AssessmentQuestions.js';
import { CopyButton } from '../../../../components/CopyButton.js';
import { IssueBadge } from '../../../../components/IssueBadge.js';
import type { EditorQuestionMetadata } from '../../../../lib/assessment-question.shared.js';
import { getQuestionUrl } from '../../../../lib/client/url.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type {
  QuestionAlternativeForm,
  QuestionWithId,
  TreeState,
  ZoneQuestionBlockForm,
} from '../../types.js';
import {
  compactPoints,
  computeQuestionTotalPoints,
  questionHasTitle,
  toAssessmentForPicker,
} from '../../utils/questions.js';
import { AssessmentBadges } from '../AssessmentBadges.js';

import { ChangeIndicatorBadges } from './ChangeIndicatorBadges.js';
import { DragHandle } from './DragHandle.js';
import { WarningIndicator } from './WarningIndicator.js';

export function PointsBadge({
  question,
  zoneQuestionBlock,
  assessmentType,
}: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  assessmentType: EnumAssessmentType;
}): ReactElement | null {
  const tooltipId = useId();
  const forceMax = question.forceMaxPoints ?? zoneQuestionBlock.forceMaxPoints;
  const autoPoints = question.autoPoints ?? zoneQuestionBlock.autoPoints;
  const manualPoints = question.manualPoints ?? zoneQuestionBlock.manualPoints;

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
          <i className="bi bi-pen-fill me-1" aria-hidden="true" />
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
  const maxAutoPoints = question.maxAutoPoints ?? zoneQuestionBlock.maxAutoPoints ?? autoPoints;
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
        <i className="bi bi-pen-fill me-1" aria-hidden="true" />
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
  questionNumber,
  alternativeNumber,
  state,
  isSelected,
  draggableAttributes,
  draggableListeners,
  onClick,
  onDelete,
}: {
  question: QuestionWithId;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  isAlternative: boolean;
  questionData: EditorQuestionMetadata | null;
  questionNumber: number;
  alternativeNumber?: number;
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

  const hasManualGradingAutoPointsWarning =
    questionData?.question.grading_method === 'Manual' &&
    ((question.autoPoints ?? zoneQuestionBlock.autoPoints) != null ||
      (question.maxAutoPoints ?? zoneQuestionBlock.maxAutoPoints) != null);

  const hasTitle = questionHasTitle(questionData);
  const renderedTitle = run(() => {
    const qid = <span className="font-monospace">{question.id}</span>;

    if (!questionData) return qid;

    return (
      <>
        <AssessmentQuestionNumber
          questionNumber={questionNumber}
          alternativeNumber={alternativeNumber}
        />{' '}
        {hasTitle ? questionData.question.title : qid}
      </>
    );
  });

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(
        'tree-row d-flex align-items-center py-1 border-bottom',
        isSelected ? 'tree-row-selected' : 'list-group-item-action',
      )}
      style={{
        paddingLeft: indent,
        // Extra right padding prevents macOS overlay scrollbars
        // from overlapping row content like the points badge.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=636564
        paddingRight: '1.5rem',
        cursor: 'pointer',
        ...(hasManualGradingAutoPointsWarning && {
          borderLeft: '6px solid var(--bs-warning)',
        }),
      }}
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
          {questionData && hasCoursePermissionPreview ? (
            <>
              <a
                href={getQuestionUrl({ courseInstanceId, questionId: questionData.question.id })}
                target={editMode ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="link-underline-opacity-0 link-underline-opacity-100-hover text-primary-emphasis"
                onClick={(e) => e.stopPropagation()}
              >
                {renderedTitle}
              </a>
              {!hasTitle && (
                <CopyButton
                  text={question.id}
                  tooltipId={`copy-qid-${question.id}`}
                  ariaLabel="Copy QID"
                  className="hover-show ms-1"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </>
          ) : (
            renderedTitle
          )}
          {questionData && (
            <IssueBadge
              count={questionData.open_issue_count}
              urlPrefix={`/pl/course_instance/${courseInstanceId}/instructor`}
              issueQid={questionData.question.qid}
              className="ms-1"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {hasManualGradingAutoPointsWarning && (
            <WarningIndicator
              tooltipId={`manual-auto-points-${question.trackingId}`}
              label="Auto points ignored"
              body="Auto points have no effect on manually-graded questions"
            />
          )}
          <ChangeIndicatorBadges
            trackingId={question.trackingId}
            comment={question.comment}
            editMode={editMode}
            changeTracking={changeTracking}
          />
        </div>
        {hasTitle && (
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
            {questionData.tags != null && questionData.tags.length > 0 && (
              <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                {questionData.tags.map((tag) => (
                  <span key={tag.name} className={`badge color-${tag.color}`}>
                    {tag.name}
                  </span>
                ))}
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
        />
      </div>
      {editMode && onDelete && (
        <button
          type="button"
          className={clsx(
            'btn btn-sm border-0 text-muted ms-1 tree-delete-btn',
            !isSelected && 'hover-show',
          )}
          aria-label={`Delete question ${question.id}`}
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
