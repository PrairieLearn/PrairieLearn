import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CSSProperties, Dispatch } from 'react';

import { ZoneHeader } from '../../../components/AssessmentQuestions.js';
import type { ZoneAssessmentForm } from '../instructorAssessmentQuestions.shared.js';
import {
  type AssessmentState,
  type EditorAction,
  type HandleDeleteQuestion,
  type HandleEditQuestion,
  getTableColumnCount,
} from '../types.js';

import { AlternativeGroup } from './AlternativeGroup.js';

/**
 * A row that serves as a drop target during drag operations.
 */
function DropZoneRow({
  setNodeRef,
  droppableId,
  isOver,
  isEmpty,
  nTableCols,
}: {
  setNodeRef: (node: HTMLElement | null) => void;
  droppableId: string;
  isOver: boolean;
  isEmpty: boolean;
  nTableCols: number;
}) {
  function getRowClassName(): string | undefined {
    if (!isEmpty) return undefined;
    return isOver ? 'bg-primary-subtle' : 'bg-warning-subtle';
  }

  function getRowStyle(): React.CSSProperties {
    if (isEmpty) {
      return { transition: 'all 0.2s ease' };
    }
    return {
      height: isOver ? 40 : 20,
      backgroundColor: isOver ? 'rgba(0, 123, 255, 0.1)' : undefined,
      transition: 'all 0.2s ease',
    };
  }

  function getCellStyle(): React.CSSProperties {
    if (isEmpty) {
      return {
        border: isOver ? '2px dashed #007bff' : 'none',
        textAlign: 'center',
      };
    }
    return {
      border: isOver ? '2px dashed #007bff' : 'none',
      textAlign: 'center',
      color: isOver ? undefined : 'transparent',
      fontSize: '0.85em',
    };
  }

  function renderContent(): React.ReactNode {
    if (isEmpty) {
      if (isOver) {
        return (
          <span className="text-primary">
            <i className="fa fa-plus-circle me-2" aria-hidden="true" />
            Drop here to add to this zone
          </span>
        );
      }
      return (
        <>
          <i className="fa fa-exclamation-triangle text-warning me-2" aria-hidden="true" />
          Drop questions here or delete this zone before saving.
        </>
      );
    }
    return isOver ? 'Drop here' : null;
  }

  return (
    <tr
      ref={setNodeRef}
      data-testid={droppableId}
      className={getRowClassName()}
      style={getRowStyle()}
    >
      <td
        colSpan={nTableCols}
        className={isEmpty ? 'text-center py-3' : undefined}
        style={getCellStyle()}
      >
        {renderContent()}
      </td>
    </tr>
  );
}

/**
 * A specific zone / section of an assessment.
 *
 * Renders a list of questions via AlternativeGroup.
 */
export function AssessmentZone({
  zone,
  zoneNumber,
  AssessmentState,
  handleAddQuestion,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  handleEditZone,
  handleDeleteZone,
  startingQuestionNumber,
  activeId,
  activeSourceZoneTrackingId,
  collapsedGroups,
  collapsedZones,
  dispatch,
}: {
  zone: ZoneAssessmentForm;
  zoneNumber: number;
  AssessmentState: AssessmentState;
  handleAddQuestion: (zoneTrackingId: string) => void;
  handleEditQuestion: HandleEditQuestion;
  handleDeleteQuestion: HandleDeleteQuestion;
  handleResetButtonClick: (questionId: string) => void;
  handleEditZone: (zoneTrackingId: string) => void;
  handleDeleteZone: (zoneTrackingId: string) => void;
  startingQuestionNumber: number;
  activeId: string | null;
  /** The trackingId of the zone containing the item being dragged, if any */
  activeSourceZoneTrackingId?: string;
  collapsedGroups: Set<string>;
  collapsedZones: Set<string>;
  dispatch: Dispatch<EditorAction>;
}) {
  const { editMode } = AssessmentState;
  const nTableCols = getTableColumnCount(AssessmentState);

  const isCollapsed = collapsedZones.has(zone.trackingId);
  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_ZONE_COLLAPSE', trackingId: zone.trackingId });

  // Create a droppable zone for dropping questions into this zone
  // Use zone index for droppable ID to maintain compatibility with drag handler
  const droppableId = `zone-${zoneNumber - 1}-droppable`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
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
    zIndex: isSortableDragging ? 1 : undefined,
  };

  return (
    <SortableContext
      items={zone.questions.map((q) => q.trackingId)}
      strategy={verticalListSortingStrategy}
    >
      <ZoneHeader
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
          {zone.questions.map((alternativeGroup, index) => (
            <AlternativeGroup
              key={alternativeGroup.trackingId}
              alternativeGroup={alternativeGroup}
              AssessmentState={AssessmentState}
              handleEditQuestion={handleEditQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleResetButtonClick={handleResetButtonClick}
              questionNumber={startingQuestionNumber + index}
              sortableId={alternativeGroup.trackingId}
              collapsedGroups={collapsedGroups}
              dispatch={dispatch}
            />
          ))}
          {/* Empty zone warning - visible when zone has no questions and NOT dragging */}
          {editMode && zone.questions.length === 0 && !activeId && (
            <tr className="bg-warning-subtle">
              <td colSpan={nTableCols} className="text-center py-3">
                <i className="fa fa-exclamation-triangle text-warning me-2" aria-hidden="true" />
                This zone has no questions. Add questions or delete this zone before saving.
              </td>
            </tr>
          )}
          {/* Drop zone - only show when dragging from a different zone */}
          {editMode && activeId && activeSourceZoneTrackingId !== zone.trackingId && (
            <DropZoneRow
              setNodeRef={setNodeRef}
              droppableId={droppableId}
              isOver={isOver}
              isEmpty={zone.questions.length === 0}
              nTableCols={nTableCols}
            />
          )}
          {/* Add question row - full width at the end of the zone */}
          {editMode && !activeId && (
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
