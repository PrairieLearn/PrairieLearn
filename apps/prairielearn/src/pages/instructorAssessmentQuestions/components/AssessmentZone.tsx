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
 * A specific zone / section of an assessment.
 *
 * Renders a list of questions via AlternativeGroup.
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

  // For empty zones, create a droppable for the warning row using the zone's trackingId
  const { setNodeRef: emptyDropRef, isOver: isOverEmpty } = useDroppable({
    id: zone.trackingId,
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
              assessmentState={assessmentState}
              handleEditQuestion={handleEditQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleResetButtonClick={handleResetButtonClick}
              questionNumber={startingQuestionNumber + index}
              sortableId={alternativeGroup.trackingId}
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
