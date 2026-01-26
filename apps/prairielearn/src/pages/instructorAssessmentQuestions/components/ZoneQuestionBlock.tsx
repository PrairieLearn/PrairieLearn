import {
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  useDroppable,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import clsx from 'clsx';
import type { CSSProperties, Dispatch } from 'react';

import { run } from '@prairielearn/run';

import { TopicBadge } from '../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type {
  QuestionAlternativeJson,
  ZoneQuestionBlockJson,
} from '../../../schemas/infoAssessment.js';
import type {
  QuestionAlternativeForm,
  ZoneQuestionBlockForm,
} from '../instructorAssessmentQuestions.shared.js';
import {
  type AssessmentState,
  type EditorAction,
  type HandleDeleteQuestion,
  type HandleEditQuestion,
  getTableColumnCount,
} from '../types.js';

import { AssessmentQuestion } from './AssessmentQuestion.js';
import { CommentIcon } from './CommentIcon.js';
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
  isTargetGroup,
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
  isTargetGroup: boolean;
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
    // For table rows, only apply Y translation to prevent squishing
    transform: transform ? `translateY(${transform.y}px)` : undefined,
    transition,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 2 : undefined,
  };

  const alternativeCount = zoneQuestionBlock.alternatives?.length ?? 0;

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
          onDeleteGroup={() =>
            handleDeleteQuestion(zoneQuestionBlock.trackingId, zoneQuestionBlock.id ?? '')
          }
          isTargetGroup={isTargetGroup}
        />
      )}
      {/* Empty group warning - also a droppable target */}
      {hasAlternatives && alternativeCount === 0 && assessmentState.editMode && (
        <EmptyGroupDropTarget
          groupTrackingId={zoneQuestionBlock.trackingId}
          nTableCols={getTableColumnCount(assessmentState)}
          parentDragTransform={isDragging ? transform : null}
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
          return zoneQuestionBlock.alternatives?.map((alternative, alternativeIndex) => {
            return (
              <DraggableAlternative
                key={alternative.trackingId}
                alternative={alternative}
                zoneQuestionBlock={zoneQuestionBlock}
                alternativeIndex={alternativeIndex}
                assessmentState={assessmentState}
                handleEditQuestion={handleEditQuestion}
                handleDeleteQuestion={handleDeleteQuestion}
                handleResetButtonClick={handleResetButtonClick}
                questionNumber={questionNumber}
                parentDragTransform={isDragging ? transform : null}
              />
            );
          });
        })}
    </>
  );
}

/**
 * A droppable target for empty alternative groups.
 * Allows dropping questions into empty groups.
 */
function EmptyGroupDropTarget({
  groupTrackingId,
  nTableCols,
  parentDragTransform,
}: {
  groupTrackingId: string;
  nTableCols: number;
  parentDragTransform: { x: number; y: number } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${groupTrackingId}-empty-group-drop`,
    data: {
      type: 'group-drop',
      groupTrackingId,
    },
  });

  const isGroupBeingDragged = parentDragTransform != null;

  return (
    <tr
      ref={setNodeRef}
      className={clsx('user-select-none', {
        'bg-primary-subtle': isOver,
        'bg-warning-subtle': !isOver && !isGroupBeingDragged,
        'bg-body-secondary': isGroupBeingDragged && !isOver,
      })}
      style={{
        transition: isGroupBeingDragged ? undefined : 'all 0.2s ease',
        opacity: isGroupBeingDragged ? 0.6 : 1,
        transform: parentDragTransform ? `translateY(${parentDragTransform.y}px)` : undefined,
        position: isGroupBeingDragged ? ('relative' as const) : undefined,
        zIndex: isGroupBeingDragged ? 2 : undefined,
      }}
    >
      <td colSpan={nTableCols} className="text-center py-3">
        {isOver ? (
          <span className="text-primary">
            <i className="fa fa-plus-circle me-2" aria-hidden="true" />
            Drop here to add to this group
          </span>
        ) : (
          <>
            <i className="fa fa-exclamation-triangle text-warning me-2" aria-hidden="true" />
            Empty alternative group. Drag questions here or delete this group.
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * A draggable wrapper for alternative questions within a group.
 * Makes individual alternatives draggable for extraction from groups.
 */
function DraggableAlternative({
  alternative,
  zoneQuestionBlock,
  alternativeIndex,
  assessmentState,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumber,
  parentDragTransform,
}: {
  alternative: QuestionAlternativeForm;
  zoneQuestionBlock: ZoneQuestionBlockForm;
  alternativeIndex: number;
  assessmentState: AssessmentState;
  handleEditQuestion: HandleEditQuestion;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  questionNumber: number;
  parentDragTransform: { x: number; y: number } | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: alternative.trackingId,
    data: {
      type: 'alternative',
      groupTrackingId: zoneQuestionBlock.trackingId,
      alternativeId: alternative.id,
    },
    disabled: !assessmentState.editMode,
  });

  // Use parent's transform when the group is being dragged, otherwise use own transform
  const effectiveTransform = parentDragTransform ?? transform;
  const isGroupBeingDragged = parentDragTransform != null;

  const sortableStyle: CSSProperties = {
    opacity: isDragging || isGroupBeingDragged ? 0.6 : 1,
    transform: effectiveTransform ? `translateY(${effectiveTransform.y}px)` : undefined,
    transition: isGroupBeingDragged ? undefined : transition,
    background: isDragging || isGroupBeingDragged ? 'rgba(0,0,0,0.04)' : undefined,
    position: isDragging || isGroupBeingDragged ? ('relative' as const) : undefined,
    zIndex: isDragging || isGroupBeingDragged ? 2 : undefined,
  };

  return (
    <AssessmentQuestion
      alternative={alternative}
      zoneQuestionBlock={zoneQuestionBlock}
      alternativeIndex={alternativeIndex}
      assessmentState={assessmentState}
      handleEditQuestion={handleEditQuestion}
      handleDeleteQuestion={handleDeleteQuestion}
      handleResetButtonClick={handleResetButtonClick}
      questionNumber={questionNumber}
      zoneQuestionBlockAutoPoints={zoneQuestionBlock.points ?? zoneQuestionBlock.autoPoints ?? null}
      sortableRef={setNodeRef}
      sortableStyle={sortableStyle}
      sortableAttributes={attributes}
      sortableListeners={listeners}
    />
  );
}

export function ZoneQuestionBlockHeader({
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
  isTargetGroup,
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
  isTargetGroup: boolean;
}) {
  // Set up droppable for receiving questions into this group
  // Use trackingId for unique ID to avoid collisions between groups in different zones
  const groupTrackingId = (zoneQuestionBlock as ZoneQuestionBlockForm).trackingId;
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `${groupTrackingId}-header-drop`,
    data: {
      type: 'group-drop',
      groupTrackingId,
    },
    disabled: !editMode,
  });
  // Combine sortable and droppable refs
  const combinedRef = (node: HTMLElement | null) => {
    sortableRef(node);
    dropRef(node);
  };

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

  // Show highlight if directly over the header OR if this group is the current drag target
  const showDropHighlight = isOver || isTargetGroup;

  // Check if this group is being dragged (sortableStyle will have opacity < 1)
  const isBeingDragged =
    typeof sortableStyle.opacity === 'number' && sortableStyle.opacity < 1;

  return (
    <tr
      ref={combinedRef}
      style={{ ...sortableStyle, cursor: 'pointer', transition: 'background-color 0.15s ease' }}
      className={clsx('user-select-none', {
        'bg-primary-subtle': showDropHighlight,
        'bg-body-secondary': isBeingDragged && !showDropHighlight,
      })}
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
            zoneQuestionBlock.numberChoose == null ? (
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
              <CommentIcon comment={zoneQuestionBlock.comment} />
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
