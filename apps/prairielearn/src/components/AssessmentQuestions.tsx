import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { CSSProperties } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../lib/assessment-question.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../schemas/infoAssessment.js';

export function AssessmentQuestionHeaders({
  question,
  nTableCols,
}: {
  question: StaffAssessmentQuestionRow;
  nTableCols: number;
}) {
  return (
    <>
      {question.start_new_zone ? (
        <tr>
          <th colSpan={nTableCols}>
            Zone {question.zone.number}. {question.zone.title}{' '}
            {question.zone.number_choose == null
              ? '(Choose all questions)'
              : question.zone.number_choose === 1
                ? '(Choose 1 question)'
                : `(Choose ${question.zone.number_choose} questions)`}
            {question.zone.max_points != null
              ? ` (maximum ${question.zone.max_points} points)`
              : ''}
            {question.zone.best_questions != null
              ? ` (best ${question.zone.best_questions} questions)`
              : ''}
          </th>
        </tr>
      ) : (
        ''
      )}
      {question.start_new_alternative_group && question.alternative_group_size > 1 ? (
        <tr>
          <td colSpan={nTableCols}>
            {question.alternative_group.number}.{' '}
            {question.alternative_group.number_choose == null
              ? 'Choose all questions from:'
              : question.alternative_group.number_choose === 1
                ? 'Choose 1 question from:'
                : `Choose ${question.alternative_group.number_choose} questions from:`}
          </td>
        </tr>
      ) : (
        ''
      )}
    </>
  );
}

export function ZoneHeader({
  zone,
  zoneNumber,
  nTableCols,
  editMode,
  handleEditZone,
  handleDeleteZone,
  isCollapsed,
  onToggle,
  sortableRef,
  sortableStyle,
  sortableAttributes,
  sortableListeners,
}: {
  zone: ZoneAssessmentJson;
  zoneNumber: number;
  nTableCols: number;
  editMode?: boolean;
  handleEditZone?: (zoneNumber: number) => void;
  handleDeleteZone?: (zoneNumber: number) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  sortableRef?: (node: HTMLElement | null) => void;
  sortableStyle?: CSSProperties;
  sortableAttributes?: DraggableAttributes;
  sortableListeners?: DraggableSyntheticListeners;
}) {
  return (
    <tr
      ref={sortableRef}
      style={{
        ...sortableStyle,
        position: 'sticky',
        top: 0,
        backgroundColor: 'var(--bs-secondary-bg)',
        zIndex: 10,
        cursor: onToggle ? 'pointer' : undefined,
      }}
      className={onToggle ? 'user-select-none' : undefined}
      onClick={onToggle}
      {...sortableAttributes}
    >
      {editMode && (
        <th className="align-content-center">
          {sortableListeners ? (
            <span
              {...sortableListeners}
              role="button"
              tabIndex={0}
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag to reorder zone"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
            >
              <i className="fa fa-grip-vertical text-muted" aria-hidden="true" />
            </span>
          ) : null}
        </th>
      )}
      {editMode && (
        <th className="align-content-center" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-sm btn-outline-secondary border-0"
            type="button"
            title="Edit zone"
            onClick={() => handleEditZone?.(zoneNumber)}
          >
            <i className="fa fa-edit" aria-hidden="true" />
          </button>
        </th>
      )}
      {editMode && (
        <th className="align-content-center" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-sm btn-outline-secondary border-0"
            type="button"
            title="Delete zone"
            onClick={() => handleDeleteZone?.(zoneNumber)}
          >
            <i className="fa fa-trash text-danger" aria-hidden="true" />
          </button>
        </th>
      )}
      <th colSpan={nTableCols - (editMode ? 3 : 0)}>
        {onToggle && (
          <i
            className={`fa fa-chevron-${isCollapsed ? 'right' : 'down'} me-2`}
            aria-hidden="true"
          />
        )}
        Zone {zoneNumber}. {zone.title}{' '}
        {zone.numberChoose == null
          ? '(Choose all questions)'
          : zone.numberChoose === 1
            ? '(Choose 1 question)'
            : `(Choose ${zone.numberChoose} questions)`}
        {zone.maxPoints != null ? ` (maximum ${zone.maxPoints} points)` : ''}
        {zone.bestQuestions != null ? ` (best ${zone.bestQuestions} questions)` : ''}
      </th>
    </tr>
  );
}

export function AlternativeGroupHeader({
  alternativeGroup,
  alternativeGroupNumber,
  nTableCols,
  questionMetadata,
  urlPrefix,
  isCollapsed,
  onToggle,
  editMode,
  sortableRef,
  sortableStyle,
  sortableAttributes,
  sortableListeners,
}: {
  alternativeGroup: ZoneQuestionJson;
  alternativeGroupNumber: number;
  nTableCols: number;
  questionMetadata?: Record<string, StaffAssessmentQuestionRow>;
  urlPrefix?: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
  editMode?: boolean;
  sortableRef?: (node: HTMLElement | null) => void;
  sortableStyle?: CSSProperties;
  sortableAttributes?: DraggableAttributes;
  sortableListeners?: DraggableSyntheticListeners;
}) {
  // Get the list of alternatives - if none exist, the main question ID is the only alternative
  const alternatives: (QuestionAlternativeJson | { id: string })[] =
    alternativeGroup.alternatives ?? (alternativeGroup.id ? [{ id: alternativeGroup.id }] : []);
  const alternativeCount = alternatives.length;

  // Build list of questions with title and URL for the popover
  const questionList = alternatives
    .map((alt) => {
      const qid = alt.id;
      const metadata = questionMetadata?.[qid];
      if (!metadata) return null;
      return {
        qid,
        title: metadata.question.title,
        url: urlPrefix ? `${urlPrefix}/question/${metadata.question.id}/preview` : null,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  const popoverContent = (
    <ul className="list-unstyled mb-0" style={{ whiteSpace: 'nowrap' }}>
      {questionList.map((question, index) => (
        <li key={question.qid}>
          {alternativeGroupNumber}.{index + 1}.{' '}
          {question.url ? <a href={question.url}>{question.title}</a> : question.title}
        </li>
      ))}
    </ul>
  );

  const theseLink = (
    <OverlayTrigger
      placement="bottom"
      trigger={['hover', 'focus']}
      popover={{
        props: {
          id: `alt-group-${alternativeGroupNumber}-popover`,
          style: { maxWidth: 'none' },
        },
        header: 'Alternative questions',
        body: popoverContent,
      }}
    >
      <button
        className="btn btn-link p-0 align-baseline text-decoration-underline"
        type="button"
        onClick={(e) => e.stopPropagation()}
      >
        these {alternativeCount}
      </button>
    </OverlayTrigger>
  );

  // Build a hint showing the first question title
  const titleHint =
    questionList.length > 0
      ? ` (${questionList[0].title}${questionList.length > 1 ? ', ...' : ''})`
      : '';

  return (
    <tr
      ref={sortableRef}
      style={{ ...sortableStyle, cursor: onToggle ? 'pointer' : undefined }}
      className={onToggle ? 'user-select-none' : undefined}
      onClick={onToggle}
      {...sortableAttributes}
    >
      {editMode && (
        <td className="align-content-center">
          {sortableListeners ? (
            <span
              {...sortableListeners}
              role="button"
              tabIndex={0}
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
            >
              <i className="fa fa-grip-vertical text-muted" aria-hidden="true" />
            </span>
          ) : null}
        </td>
      )}
      <td colSpan={editMode ? nTableCols - 1 : nTableCols}>
        {onToggle && (
          <i
            className={`fa fa-chevron-${isCollapsed ? 'right' : 'down'} me-2`}
            aria-hidden="true"
          />
        )}
        {alternativeGroupNumber}.{' '}
        {alternativeGroup.numberChoose == null ? (
          <>
            Choose all questions from {theseLink}
            {titleHint}:
          </>
        ) : alternativeGroup.numberChoose === 1 ? (
          <>
            Choose 1 question from {theseLink}
            {titleHint}:
          </>
        ) : (
          <>
            Choose {alternativeGroup.numberChoose} questions from {theseLink}
            {titleHint}:
          </>
        )}
      </td>
    </tr>
  );
}

export function AssessmentQuestionNumber({
  alternativeGroupSize,
  alternativeGroupNumber,
  numberInAlternativeGroup,
}: {
  alternativeGroupSize: number;
  alternativeGroupNumber: number;
  numberInAlternativeGroup: number | null;
}) {
  return alternativeGroupSize === 1 ? (
    `${alternativeGroupNumber}. `
  ) : (
    <span className="ms-3">
      {alternativeGroupNumber}.{numberInAlternativeGroup}.{' '}
    </span>
  );
}
