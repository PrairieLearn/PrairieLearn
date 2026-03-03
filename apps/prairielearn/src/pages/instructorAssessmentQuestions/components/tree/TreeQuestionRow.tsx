import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import clsx from 'clsx';
import { type ReactElement, useId } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import { CopyButton } from '../../../../components/CopyButton.js';
import { HistMini } from '../../../../components/HistMini.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { QuestionAlternativeForm, ViewType, ZoneQuestionBlockForm } from '../../types.js';
import { toAssessmentForPicker } from '../../utils/questions.js';
import { AssessmentBadges } from '../AssessmentBadges.js';
import { SubtleBadge } from '../SubtleBadge.js';

import { DragHandle } from './DragHandle.js';

function PointsBadge({
  question,
  zoneQuestionBlock,
  assessmentType,
}: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  assessmentType: EnumAssessmentType;
}): ReactElement | null {
  const tooltipId = useId();
  const autoPoints =
    question.points ??
    question.autoPoints ??
    zoneQuestionBlock.points ??
    zoneQuestionBlock.autoPoints;
  const manualPoints = question.manualPoints ?? zoneQuestionBlock.manualPoints;

  if (assessmentType === 'Exam') {
    if (autoPoints == null && manualPoints == null) return null;

    const compactParts: ReactElement[] = [];
    const tooltipParts: string[] = [];

    if (autoPoints != null) {
      const pts = Array.isArray(autoPoints) ? autoPoints : [autoPoints];
      compactParts.push(
        <span key="auto">
          <i className="bi bi-lightning-fill me-1" aria-hidden="true" />
          {pts.join(', ')}
        </span>,
      );
      tooltipParts.push(
        pts.length > 1
          ? `Auto-graded: ${pts.join(', ')} pts (per variant)`
          : `Auto-graded: ${pts[0]} pts`,
      );
    }

    if (manualPoints != null) {
      if (compactParts.length > 0) {
        compactParts.push(<span key="sep"> + </span>);
      }
      compactParts.push(
        <span key="manual">
          <i className="bi bi-pencil-fill me-1" aria-hidden="true" />
          {manualPoints}
        </span>,
      );
      tooltipParts.push(`Manual grading: ${manualPoints} pts`);
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
    zoneQuestionBlock.maxAutoPoints;
  const maxAuto = Array.isArray(maxAutoPoints) ? maxAutoPoints[0] : maxAutoPoints;

  if (initPoints == null && maxAuto == null && manualPoints == null) return null;

  const compactParts: ReactElement[] = [];
  const tooltipParts: string[] = [];

  if (initPoints != null || maxAuto != null) {
    compactParts.push(
      <span key="auto">
        <i className="bi bi-lightning-fill me-1" aria-hidden="true" />
        {initPoints ?? 0}/{maxAuto ?? 0}
      </span>,
    );
    tooltipParts.push(`Auto-graded: ${initPoints ?? 0} pts initial, ${maxAuto ?? 0} pts max`);
  }

  if (manualPoints != null) {
    if (compactParts.length > 0) {
      compactParts.push(<span key="sep"> + </span>);
    }
    compactParts.push(
      <span key="manual">
        <i className="bi bi-pencil-fill me-1" aria-hidden="true" />
        {manualPoints}
      </span>,
    );
    tooltipParts.push(`Manual grading: ${manualPoints} pts`);
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
  editMode,
  viewType,
  isSelected,
  urlPrefix,
  hasCoursePermissionPreview,
  assessmentType,
  sortableAttributes,
  sortableListeners,
  onClick,
  onDelete,
}: {
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  isAlternative: boolean;
  questionData: StaffAssessmentQuestionRow | null;
  editMode: boolean;
  viewType: ViewType;
  isSelected: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  assessmentType: EnumAssessmentType;
  sortableAttributes?: DraggableAttributes;
  sortableListeners?: DraggableSyntheticListeners;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const indent = isAlternative ? '4.5rem' : '2.5rem';

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(
        'tree-row d-flex align-items-center py-1 border-bottom',
        isSelected ? 'bg-primary-subtle' : 'list-group-item-action',
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
      {editMode && sortableListeners && sortableAttributes && (
        <DragHandle attributes={sortableAttributes} listeners={sortableListeners} />
      )}
      <i className="bi bi-file-earmark-text text-muted me-2" aria-hidden="true" />
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="text-truncate">
          {questionData ? (
            hasCoursePermissionPreview ? (
              <>
                <a
                  href={`${urlPrefix}/question/${questionData.question.id}/`}
                  className="link-underline-opacity-0 link-underline-opacity-100-hover text-primary-emphasis"
                  onClick={(e) => e.stopPropagation()}
                >
                  {questionData.question.title}
                </a>
                <i
                  className="bi bi-box-arrow-up-right text-muted small ms-1 tree-hover-show"
                  aria-hidden="true"
                />
              </>
            ) : (
              questionData.question.title
            )
          ) : (
            <span className="text-muted small">{question.id}</span>
          )}
        </div>
        {question.id && (
          <div className="d-flex align-items-center text-muted" style={{ fontSize: '0.8rem' }}>
            <span className="text-truncate">{question.id}</span>
            {/* eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- wrapper only stops propagation to prevent row click */}
            <span className="tree-hover-show" onClick={(e) => e.stopPropagation()}>
              <CopyButton
                text={question.id}
                tooltipId={`copy-qid-${question.id}`}
                ariaLabel="Copy QID"
              />
            </span>
          </div>
        )}
        {viewType === 'detailed' && questionData && (
          <>
            <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
              <SubtleBadge color={questionData.topic.color} label={questionData.topic.name} />
              {questionData.tags?.map((tag) => (
                <SubtleBadge key={tag.name} color={tag.color} label={tag.name} />
              ))}
              {questionData.assessment_question.number_submissions_hist && (
                <HistMini
                  data={questionData.assessment_question.number_submissions_hist}
                  options={{ width: 60, height: 20 }}
                />
              )}
            </div>
            {questionData.other_assessments && questionData.other_assessments.length > 0 && (
              <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                <AssessmentBadges
                  assessments={toAssessmentForPicker(questionData.other_assessments)}
                  urlPrefix={urlPrefix}
                  subtle
                />
              </div>
            )}
          </>
        )}
      </div>
      {viewType === 'simple' && questionData && (
        <div className="ms-2 me-2">
          <SubtleBadge color={questionData.topic.color} label={questionData.topic.name} />
        </div>
      )}
      <PointsBadge
        question={question}
        zoneQuestionBlock={zoneQuestionBlock}
        assessmentType={assessmentType}
      />
      {editMode && onDelete && (
        <button
          type="button"
          className="btn btn-sm border-0 text-muted ms-1 tree-delete-btn tree-hover-show"
          title="Delete question"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <i className="bi bi-trash3" aria-hidden="true" />
        </button>
      )}
      {!editMode && <i className="bi bi-chevron-right text-muted small ms-1" aria-hidden="true" />}
    </div>
  );
}
