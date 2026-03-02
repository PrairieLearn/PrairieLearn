import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import clsx from 'clsx';

import { TagBadgeList } from '../../../../components/TagBadge.js';
import { TopicBadge } from '../../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { QuestionAlternativeForm, ViewType, ZoneQuestionBlockForm } from '../../types.js';

function formatPoints(
  question: ZoneQuestionBlockForm | QuestionAlternativeForm,
  zoneQuestionBlock: ZoneQuestionBlockForm,
  assessmentType: EnumAssessmentType,
): string {
  const autoPoints =
    question.points ??
    question.autoPoints ??
    zoneQuestionBlock.points ??
    zoneQuestionBlock.autoPoints;
  const manualPoints = question.manualPoints ?? zoneQuestionBlock.manualPoints;

  if (assessmentType === 'Exam') {
    if (autoPoints != null) {
      const pts = Array.isArray(autoPoints) ? autoPoints : [autoPoints];
      return pts.join(', ') + ' pts';
    }
    if (manualPoints != null) return `${manualPoints} pts (manual)`;
    return '';
  }

  // Homework
  const initPoints = Array.isArray(autoPoints) ? autoPoints[0] : autoPoints;
  const maxAutoPoints =
    question.maxPoints ??
    question.maxAutoPoints ??
    zoneQuestionBlock.maxPoints ??
    zoneQuestionBlock.maxAutoPoints;
  const maxAuto = Array.isArray(maxAutoPoints) ? maxAutoPoints[0] : maxAutoPoints;

  const parts: string[] = [];
  if (initPoints != null || maxAuto != null) {
    parts.push(`${initPoints ?? 0}/${maxAuto ?? 0}`);
  }
  if (manualPoints != null) {
    parts.push(`+${manualPoints} manual`);
  }
  return parts.join(' ') || '';
}

export function TreeQuestionRow({
  question,
  zoneQuestionBlock,
  questionNumber,
  alternativeNumber,
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
  questionNumber: number;
  alternativeNumber: number | null;
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
  const numberText =
    alternativeNumber != null ? `${questionNumber}.${alternativeNumber}.` : `${questionNumber}.`;

  const indent = alternativeNumber != null ? '3rem' : '1.5rem';
  const pointsText = formatPoints(question, zoneQuestionBlock, assessmentType);

  return (
    <div
      role="button"
      tabIndex={0}
      className={clsx(
        'd-flex align-items-center px-2 py-1 border-bottom',
        isSelected ? 'bg-primary-subtle' : 'list-group-item-action',
      )}
      style={{ paddingLeft: indent, cursor: 'pointer' }}
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
      <span className="badge color-gray1 me-2" style={{ minWidth: '2.5em' }}>
        {numberText}
      </span>
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2">
          <span className="text-truncate">
            {questionData ? (
              hasCoursePermissionPreview ? (
                <a
                  href={`${urlPrefix}/question/${questionData.question.id}/`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {questionData.question.title}
                </a>
              ) : (
                questionData.question.title
              )
            ) : (
              <code>{question.id}</code>
            )}
          </span>
          {questionData && <code className="text-muted small text-nowrap">{question.id}</code>}
        </div>
        {viewType === 'detailed' && questionData && (
          <div className="d-flex flex-wrap gap-1 mt-1">
            <TopicBadge topic={questionData.topic} />
            <TagBadgeList tags={questionData.tags} />
          </div>
        )}
      </div>
      {questionData && viewType === 'simple' && (
        <div className="ms-2 me-2">
          <TopicBadge topic={questionData.topic} />
        </div>
      )}
      {pointsText && <span className="text-muted small text-nowrap ms-2">{pointsText}</span>}
      {editMode && onDelete && (
        <button
          type="button"
          className="btn btn-sm btn-outline-danger border-0 ms-1"
          title="Delete question"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <i className="fa fa-trash" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
