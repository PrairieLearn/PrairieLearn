import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import clsx from 'clsx';
import { type ReactElement, useId } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import { CopyButton } from '../../../../components/CopyButton.js';
import { HistMini } from '../../../../components/HistMini.js';
import type { OtherAssessment, StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { AssessmentForPicker, QuestionAlternativeForm, ViewType, ZoneQuestionBlockForm } from '../../types.js';
import { AssessmentBadges } from '../AssessmentBadges.js';
import { SubtleBadge } from '../SubtleBadge.js';

function toAssessmentForPicker(assessments: OtherAssessment[]): AssessmentForPicker[] {
  return assessments.map((a) => ({
    assessment_id: String(a.assessment_id),
    label: `${a.assessment_set_abbreviation}${a.assessment_number}`,
    color: a.assessment_set_color,
    assessment_set_abbreviation: a.assessment_set_abbreviation ?? undefined,
    assessment_set_name: a.assessment_set_name ?? undefined,
    assessment_set_color: a.assessment_set_color,
    assessment_number: a.assessment_number ?? undefined,
  }));
}

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
      <OverlayTrigger placement="top" tooltip={{ props: { id: tooltipId }, body: tooltipParts.join(' · ') }}>
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
    tooltipParts.push(
      `Auto-graded: ${initPoints ?? 0} pts initial, ${maxAuto ?? 0} pts max`,
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
    <OverlayTrigger placement="top" tooltip={{ props: { id: tooltipId }, body: tooltipParts.join(' · ') }}>
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
        'd-flex align-items-center py-1 border-bottom',
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
      {editMode && sortableListeners && (
        // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
        <span
          {...sortableAttributes}
          {...sortableListeners}
          className="me-2"
          style={{ cursor: 'grab', touchAction: 'none' }}
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            sortableListeners.onKeyDown(e);
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
            }
          }}
        >
          <i className="fa fa-grip-vertical text-muted" aria-hidden="true" />
        </span>
      )}
      <i className="bi bi-file-earmark-text text-muted me-2" aria-hidden="true" />
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="text-truncate">
          {questionData ? (
            hasCoursePermissionPreview ? (
              <a
                href={`${urlPrefix}/question/${questionData.question.id}/`}
                className="text-decoration-underline text-body"
                onClick={(e) => e.stopPropagation()}
              >
                {questionData.question.title}
              </a>
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
            <span onClick={(e) => e.stopPropagation()}>
              <CopyButton text={question.id} tooltipId={`copy-qid-${question.id}`} ariaLabel="Copy QID" />
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
          className="btn btn-sm border-0 text-muted ms-1 tree-delete-btn"
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
