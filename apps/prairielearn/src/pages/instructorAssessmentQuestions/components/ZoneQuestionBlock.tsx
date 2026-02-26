import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { CSSProperties, Dispatch } from 'react';

import { run } from '@prairielearn/run';

import { CommentPopover } from '../../../components/CommentPopover.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.shared.js';
import type {
  QuestionAlternativeJson,
  ZoneQuestionBlockJson,
} from '../../../schemas/infoAssessment.js';
import {
  type AssessmentState,
  type EditorAction,
  type HandleDeleteQuestion,
  type HandleEditQuestion,
  type ZoneQuestionBlockForm,
  getTableColumnCount,
} from '../types.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';
import { QuestionNumberTitleCell } from './QuestionNumberTitleCell.js';

/**
 * Renders a zone question block, which may be a single question or multiple alternatives.
 * Rendered by the AssessmentZone component.
 */
export function ZoneQuestionBlock({
  zoneQuestionBlock,
  assessmentState,
  handleEditQuestion,
  handleEditGroup,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumber,
  sortableId,
  collapsedGroups,
  dispatch,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  assessmentState: AssessmentState;
  handleEditQuestion: HandleEditQuestion;
  handleEditGroup: (group: ZoneQuestionBlockForm) => void;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  questionNumber: number;
  sortableId: string;
  collapsedGroups: Set<string>;
  dispatch: Dispatch<EditorAction>;
}) {
  // A question can either have alternatives, or an id,
  // but not both.
  const hasAlternatives = zoneQuestionBlock.id == null;
  const isCollapsed = collapsedGroups.has(zoneQuestionBlock.trackingId);
  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_GROUP_COLLAPSE', trackingId: zoneQuestionBlock.trackingId });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { type: 'question' },
  });

  const sortableStyle: CSSProperties = {
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
    // For table rows, only apply Y translation to prevent squishing
    transform: transform ? `translateY(${transform.y}px)` : undefined,
    transition,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <>
      {hasAlternatives && (
        <ZoneQuestionBlockHeader
          zoneQuestionBlock={zoneQuestionBlock}
          zoneQuestionBlockNumber={questionNumber}
          nTableCols={getTableColumnCount(assessmentState)}
          questionMetadata={assessmentState.questionMetadata}
          isCollapsed={isCollapsed}
          editMode={assessmentState.editMode}
          sortableRef={setNodeRef}
          sortableStyle={sortableStyle}
          sortableAttributes={attributes}
          sortableListeners={listeners}
          onToggle={toggleCollapse}
          onEditGroup={() => handleEditGroup(zoneQuestionBlock)}
          // Groups always have null `id`; the reducer skips metadata deletion for falsy values.
          onDeleteGroup={() =>
            handleDeleteQuestion(zoneQuestionBlock.trackingId, zoneQuestionBlock.id ?? '')
          }
        />
      )}
      {(!isCollapsed || !hasAlternatives) &&
        run(() => {
          if (!hasAlternatives) {
            return (
              <AssessmentQuestion
                zoneQuestionBlock={zoneQuestionBlock}
                assessmentState={assessmentState}
                handleEditQuestion={handleEditQuestion}
                handleDeleteQuestion={handleDeleteQuestion}
                handleResetButtonClick={handleResetButtonClick}
                questionNumber={questionNumber}
                sortableRef={setNodeRef}
                sortableStyle={sortableStyle}
                sortableAttributes={attributes}
                sortableListeners={listeners}
              />
            );
          }

          // Sortable props are on ZoneQuestionBlockHeader, not on individual questions
          if (!zoneQuestionBlock.alternatives?.length) {
            return (
              <tr>
                <td
                  colSpan={getTableColumnCount(assessmentState)}
                  className="text-center text-muted py-3"
                >
                  No alternatives in this group. Use the question picker to add questions.
                </td>
              </tr>
            );
          }

          return zoneQuestionBlock.alternatives.map((alternative, alternativeIndex) => {
            return (
              <AssessmentQuestion
                key={alternative.trackingId}
                alternative={alternative}
                zoneQuestionBlock={zoneQuestionBlock}
                alternativeIndex={alternativeIndex}
                assessmentState={assessmentState}
                handleEditQuestion={handleEditQuestion}
                handleDeleteQuestion={handleDeleteQuestion}
                handleResetButtonClick={handleResetButtonClick}
                questionNumber={questionNumber}
                zoneQuestionBlockAutoPoints={
                  zoneQuestionBlock.points ?? zoneQuestionBlock.autoPoints ?? null
                }
              />
            );
          });
        })}
    </>
  );
}

function ZoneQuestionBlockHeader({
  zoneQuestionBlock,
  zoneQuestionBlockNumber,
  nTableCols,
  questionMetadata,
  isCollapsed,
  onToggle,
  onEditGroup,
  onDeleteGroup,
  editMode,
  sortableRef,
  sortableStyle,
  sortableAttributes,
  sortableListeners,
}: {
  zoneQuestionBlock: ZoneQuestionBlockJson;
  zoneQuestionBlockNumber: number;
  nTableCols: number;
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  isCollapsed: boolean;
  onToggle: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  editMode: boolean;
  sortableRef: (node: HTMLElement | null) => void;
  sortableStyle: CSSProperties;
  sortableAttributes: DraggableAttributes;
  sortableListeners: DraggableSyntheticListeners;
}) {
  // Get the list of alternatives - if none exist, the main question ID is the only alternative
  const alternatives: (QuestionAlternativeJson | { id: string })[] =
    zoneQuestionBlock.alternatives ?? (zoneQuestionBlock.id ? [{ id: zoneQuestionBlock.id }] : []);
  const alternativeCount = alternatives.length;

  // Check if all alternatives share the same topic
  const sharedTopic = (() => {
    if (alternatives.length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const topics = alternatives.map((alt) => questionMetadata[alt.id]?.topic);

    const firstTopic = topics[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (firstTopic && topics.every((t) => t?.name === firstTopic.name)) {
      return firstTopic;
    }
    return null;
  })();

  return (
    <tr
      ref={sortableRef}
      style={{ ...sortableStyle, cursor: 'pointer' }}
      className="user-select-none"
      onClick={onToggle}
    >
      {editMode && (
        <td className="align-content-center">
          {sortableListeners ? (
            // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
            <span
              {...sortableAttributes}
              {...sortableListeners}
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // Call dnd-kit's keyboard handler first
                sortableListeners.onKeyDown(e);
                // Stop propagation to prevent the row from collapsing when using keyboard navigation
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
      {editMode && (
        <td className="align-content-center">
          <button
            className="btn btn-sm btn-outline-secondary border-0"
            type="button"
            title="Edit alternative group"
            onClick={(e) => {
              e.stopPropagation();
              onEditGroup();
            }}
          >
            <i className="fa fa-edit" aria-hidden="true" />
          </button>
        </td>
      )}
      {editMode && (
        <td className="align-content-center">
          <button
            className="btn btn-sm btn-outline-secondary border-0"
            type="button"
            title="Delete alternative group"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteGroup();
            }}
          >
            <i className="fa fa-trash text-danger" aria-hidden="true" />
          </button>
        </td>
      )}
      <td>
        <QuestionNumberTitleCell
          questionNumber={zoneQuestionBlockNumber}
          alternativeNumber={null}
          titleContent={
            alternativeCount === 0 ? (
              <>Empty alternative group</>
            ) : zoneQuestionBlock.numberChoose == null ? (
              <>All questions from these {alternativeCount}:</>
            ) : zoneQuestionBlock.numberChoose === 1 ? (
              <>1 question from these {alternativeCount}:</>
            ) : (
              <>
                {zoneQuestionBlock.numberChoose} questions from these {alternativeCount}:
              </>
            )
          }
          qidContent={
            <>
              <i
                className={`fa fa-chevron-${isCollapsed ? 'right' : 'down'} me-2`}
                aria-hidden="true"
              />
              {alternatives.slice(0, 2).map((alt, i) => (
                <span key={alt.id} className="small text-muted">
                  {i > 0 && ', '}
                  <code className="text-muted">{alt.id}</code>
                </span>
              ))}
              {alternatives.length > 2 && <span className="small text-muted">, ...</span>}
              <CommentPopover comment={zoneQuestionBlock.comment} />
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
