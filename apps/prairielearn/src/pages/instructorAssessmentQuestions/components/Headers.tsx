import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { CSSProperties } from 'react';

import { TopicBadge } from '../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../../../schemas/infoAssessment.js';

import { QuestionNumberTitleCell } from './QuestionNumberTitleCell.js';

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
    >
      {editMode && (
        <th className="align-content-center">
          {sortableListeners ? (
            // Accessible roles are provided via sortableAttributes
            // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
            <span
              {...sortableListeners}
              {...sortableAttributes}
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
          ? '(All questions)'
          : zone.numberChoose === 1
            ? '(1 question)'
            : `(${zone.numberChoose} questions)`}
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

  // Check if all alternatives share the same topic
  const sharedTopic = (() => {
    if (!questionMetadata || alternatives.length === 0) return null;

    const topics = alternatives
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      .map((alt) => questionMetadata[alt.id]?.topic)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      .filter((t): t is NonNullable<typeof t> => t != null);

    // All alternatives must have topic metadata and share the same topic name
    if (topics.length !== alternatives.length) return null;
    const firstTopic = topics[0];
    if (topics.every((t) => t.name === firstTopic.name)) {
      return firstTopic;
    }
    return null;
  })();

  return (
    <tr
      ref={sortableRef}
      style={{ ...sortableStyle, cursor: onToggle ? 'pointer' : undefined }}
      className={onToggle ? 'user-select-none' : undefined}
      onClick={onToggle}
    >
      {editMode && (
        <td className="align-content-center">
          {sortableListeners ? (
            // Accessible roles are provided via sortableAttributes
            // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
            <span
              {...sortableListeners}
              {...sortableAttributes}
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
      {editMode && <td />}
      {editMode && <td />}
      <td>
        <QuestionNumberTitleCell
          questionNumber={alternativeGroupNumber}
          alternativeNumber={null}
          titleContent={
            alternativeGroup.numberChoose == null ? (
              <>All questions from these {alternativeCount}:</>
            ) : alternativeGroup.numberChoose === 1 ? (
              <>1 question from these {alternativeCount}:</>
            ) : (
              <>
                {alternativeGroup.numberChoose} questions from these {alternativeCount}:
              </>
            )
          }
          qidContent={
            <>
              {onToggle && (
                <i
                  className={`fa fa-chevron-${isCollapsed ? 'right' : 'down'} me-2`}
                  aria-hidden="true"
                />
              )}
              {alternatives.slice(0, 2).map((alt, i) => (
                <span key={alt.id} className="small text-muted">
                  {i > 0 && ', '}
                  <code className="text-muted">{alt.id}</code>
                </span>
              ))}
              {alternatives.length > 2 && <span className="small text-muted">, ...</span>}
            </>
          }
        />
      </td>
      <td>{sharedTopic && <TopicBadge topic={sharedTopic} />}</td>
      {/* Span remaining columns: nTableCols - drag(1) - edit(1) - delete(1) - title(1) - topic(1) in edit mode */}
      <td colSpan={editMode ? nTableCols - 5 : nTableCols - 2} />
    </tr>
  );
}
