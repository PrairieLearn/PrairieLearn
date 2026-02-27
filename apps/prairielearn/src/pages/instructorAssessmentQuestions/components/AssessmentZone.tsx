import {
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CSSProperties, Dispatch } from 'react';

import { CommentPopover } from '../../../components/CommentPopover.js';
import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import {
  type AssessmentState,
  type EditorAction,
  type HandleDeleteQuestion,
  type HandleEditQuestion,
  type ZoneAssessmentForm,
  getTableColumnCount,
} from '../types.js';

import { ZoneQuestionBlock } from './ZoneQuestionBlock.js';

/**
 * A specific zone / section of an assessment.
 *
 * Renders a list of questions via ZoneQuestionBlock.
 */
export function AssessmentZone({
  zone,
  zoneNumber,
  assessmentState,
  handleAddQuestion,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  handleEditZone,
  handleDeleteZone,
  startingQuestionNumber,
  collapsedGroups,
  collapsedZones,
  dispatch,
}: {
  zone: ZoneAssessmentForm;
  zoneNumber: number;
  assessmentState: AssessmentState;
  handleAddQuestion: (zoneTrackingId: string) => void;
  handleEditQuestion: HandleEditQuestion;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  handleEditZone: (zoneTrackingId: string) => void;
  handleDeleteZone: (zoneTrackingId: string) => void;
  startingQuestionNumber: number;
  collapsedGroups: Set<string>;
  collapsedZones: Set<string>;
  dispatch: Dispatch<EditorAction>;
}) {
  const { editMode } = assessmentState;
  const nTableCols = getTableColumnCount(assessmentState);

  const isCollapsed = collapsedZones.has(zone.trackingId);
  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_ZONE_COLLAPSE', trackingId: zone.trackingId });
  const { setNodeRef: emptyDropRef, isOver: isOverEmpty } = useDroppable({
    id: `${zone.trackingId}-empty-drop`,
    disabled: zone.questions.length > 0, // Only active when zone is empty
  });

  // Make the zone itself sortable for reordering zones
  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef: sortableRef,
    transform: sortableTransform,
    transition: sortableTransition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: zone.trackingId,
    data: { type: 'zone' },
    disabled: !editMode,
  });

  const sortableStyle: CSSProperties = {
    opacity: isSortableDragging ? 0.6 : 1,
    transform: sortableTransform ? `translateY(${sortableTransform.y}px)` : undefined,
    transition: sortableTransition,
    background: isSortableDragging ? 'rgba(0,0,0,0.04)' : undefined,
    position: isSortableDragging ? ('relative' as const) : undefined,
    zIndex: isSortableDragging ? 2 : undefined,
  };

  return (
    <SortableContext
      items={zone.questions.map((q) => q.trackingId)}
      strategy={verticalListSortingStrategy}
    >
      <AssessmentZoneHeader
        zone={zone}
        zoneNumber={zoneNumber}
        nTableCols={nTableCols}
        editMode={editMode}
        handleEditZone={() => handleEditZone(zone.trackingId)}
        handleDeleteZone={() => handleDeleteZone(zone.trackingId)}
        isCollapsed={isCollapsed}
        sortableRef={sortableRef}
        sortableStyle={sortableStyle}
        sortableAttributes={sortableAttributes}
        sortableListeners={sortableListeners}
        onToggle={toggleCollapse}
      />
      {!isCollapsed && (
        <>
          {zone.questions.map((zoneQuestionBlock, index) => (
            <ZoneQuestionBlock
              key={zoneQuestionBlock.trackingId}
              zoneQuestionBlock={zoneQuestionBlock}
              assessmentState={assessmentState}
              handleEditQuestion={handleEditQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleResetButtonClick={handleResetButtonClick}
              questionNumber={startingQuestionNumber + index}
              sortableId={zoneQuestionBlock.trackingId}
              collapsedGroups={collapsedGroups}
              dispatch={dispatch}
            />
          ))}
          {/* Empty zone warning - now also serves as a droppable target */}
          {editMode && zone.questions.length === 0 && (
            <tr
              ref={emptyDropRef}
              className={isOverEmpty ? 'bg-primary-subtle' : 'bg-warning-subtle'}
              style={{ transition: 'all 0.2s ease' }}
            >
              <td colSpan={nTableCols} className="text-center py-3">
                {isOverEmpty ? (
                  <span className="text-primary">
                    <i className="fa fa-plus-circle me-2" aria-hidden="true" />
                    Drop here to add to this zone
                  </span>
                ) : (
                  <>
                    <i
                      className="fa fa-exclamation-triangle text-warning me-2"
                      aria-hidden="true"
                    />
                    This zone has no questions. Add questions or delete this zone before saving.
                  </>
                )}
              </td>
            </tr>
          )}
          {/* Add question row - full width at the end of the zone */}
          {editMode && (
            <tr>
              <td colSpan={nTableCols} className="py-2">
                <button
                  className="btn btn-sm btn-outline-primary"
                  type="button"
                  onClick={() => handleAddQuestion(zone.trackingId)}
                >
                  <i className="fa fa-plus me-1" aria-hidden="true" />
                  Add question in zone {zoneNumber}
                </button>
              </td>
            </tr>
          )}
        </>
      )}
    </SortableContext>
  );
}

function AssessmentZoneHeader({
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
  editMode: boolean;
  handleEditZone: (zoneNumber: number) => void;
  handleDeleteZone: (zoneNumber: number) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  sortableRef: (node: HTMLElement | null) => void;
  sortableStyle: CSSProperties;
  sortableAttributes: DraggableAttributes;
  sortableListeners: DraggableSyntheticListeners;
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
        cursor: 'pointer',
      }}
      className="user-select-none"
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
                // Call dnd-kit's keyboard handler first to preserve KeyboardSensor behavior
                sortableListeners.onKeyDown(e);
                // Stop this from collapsing the section
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
            onClick={() => handleEditZone(zoneNumber)}
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
            onClick={() => handleDeleteZone(zoneNumber)}
          >
            <i className="fa fa-trash text-danger" aria-hidden="true" />
          </button>
        </th>
      )}
      <th colSpan={nTableCols - (editMode ? 3 : 0)}>
        <div className="d-flex align-items-center">
          <i
            className={`fa fa-chevron-${isCollapsed ? 'right' : 'down'} me-2`}
            aria-hidden="true"
          />
          Zone {zoneNumber}. {zone.title}{' '}
          {zone.numberChoose == null
            ? '(All questions)'
            : zone.numberChoose === 1
              ? '(1 question)'
              : `(${zone.numberChoose} questions)`}
          {zone.maxPoints != null ? ` (maximum ${zone.maxPoints} points)` : ''}
          {zone.bestQuestions != null ? ` (best ${zone.bestQuestions} questions)` : ''}
          {zone.lockpoint && (
            <span className="badge text-bg-warning ms-2">
              <i className="bi bi-lock-fill me-1" aria-hidden="true" />
              Lockpoint
            </span>
          )}
          <CommentPopover comment={zone.comment} />
        </div>
      </th>
    </tr>
  );
}
