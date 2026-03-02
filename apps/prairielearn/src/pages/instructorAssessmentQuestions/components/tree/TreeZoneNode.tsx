import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import type { CSSProperties, Dispatch } from 'react';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneAssessmentForm } from '../../types.js';

import { TreeEmptyDropZone } from './TreeEmptyDropZone.js';
import { TreeQuestionBlockNode } from './TreeQuestionBlockNode.js';

export function TreeZoneNode({
  zone,
  zoneNumber,
  editMode,
  viewType,
  selectedItem,
  setSelectedItem,
  questionMetadata,
  collapsedGroups,
  collapsedZones,
  urlPrefix,
  hasCoursePermissionPreview,
  assessmentType,
  startingQuestionNumber,
  dispatch,
  onAddQuestion,
  onDeleteQuestion,
  onDeleteZone,
}: {
  zone: ZoneAssessmentForm;
  zoneNumber: number;
  editMode: boolean;
  viewType: ViewType;
  selectedItem: SelectedItem;
  setSelectedItem: (item: SelectedItem) => void;
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  collapsedGroups: Set<string>;
  collapsedZones: Set<string>;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  assessmentType: EnumAssessmentType;
  startingQuestionNumber: number;
  dispatch: Dispatch<EditorAction>;
  onAddQuestion: (zoneTrackingId: string) => void;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteZone: (zoneTrackingId: string) => void;
}) {
  const isCollapsed = collapsedZones.has(zone.trackingId);
  const isSelected =
    selectedItem?.type === 'zone' && selectedItem.zoneTrackingId === zone.trackingId;

  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_ZONE_COLLAPSE', trackingId: zone.trackingId });

  const { setNodeRef: emptyDropRef, isOver: isOverEmpty } = useDroppable({
    id: `${zone.trackingId}-empty-drop`,
    disabled: zone.questions.length > 0,
  });

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
    position: isSortableDragging ? 'relative' : undefined,
    zIndex: isSortableDragging ? 2 : undefined,
  };

  const handleZoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItem({ type: 'zone', zoneTrackingId: zone.trackingId });
  };

  return (
    <SortableContext
      items={zone.questions.map((q) => q.trackingId)}
      strategy={verticalListSortingStrategy}
    >
      <div ref={sortableRef} style={sortableStyle}>
        {/* Zone header */}
        <div
          role="button"
          tabIndex={0}
          className={clsx(
            'd-flex align-items-center px-2 py-2 border-bottom user-select-none',
            isSelected ? 'bg-primary-subtle' : 'bg-body-secondary',
          )}
          style={{ cursor: 'pointer', position: 'sticky', top: 0, zIndex: 10 }}
          onClick={handleZoneClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleZoneClick(e as unknown as React.MouseEvent);
            }
          }}
        >
          {editMode && sortableListeners && (
            // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
            <span
              {...sortableListeners}
              {...sortableAttributes}
              className="me-2"
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag to reorder zone"
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
          <button
            type="button"
            className="btn btn-sm p-0 border-0 me-1"
            aria-label={isCollapsed ? 'Expand zone' : 'Collapse zone'}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
          >
            <i className={`fa fa-chevron-${isCollapsed ? 'right' : 'down'}`} aria-hidden="true" />
          </button>
          <span className="fw-semibold flex-grow-1">
            Zone {zoneNumber}
            {zone.title ? `: ${zone.title}` : ''}
          </span>
          <span className="text-muted small me-2">
            {zone.numberChoose == null
              ? `${zone.questions.length} questions`
              : `Choose ${zone.numberChoose}`}
            {zone.maxPoints != null ? ` · max ${zone.maxPoints} pts` : ''}
            {zone.bestQuestions != null ? ` · best ${zone.bestQuestions}` : ''}
          </span>
          {zone.lockpoint && (
            <span className="badge text-bg-warning me-1">
              <i className="bi bi-lock-fill me-1" aria-hidden="true" />
              Lockpoint
            </span>
          )}
          {editMode && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger border-0 ms-1"
              title="Delete zone"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteZone(zone.trackingId);
              }}
            >
              <i className="fa fa-trash" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Zone content */}
        {!isCollapsed && (
          <>
            {zone.questions.map((zoneQuestionBlock, index) => (
              <TreeQuestionBlockNode
                key={zoneQuestionBlock.trackingId}
                zoneQuestionBlock={zoneQuestionBlock}
                questionNumber={startingQuestionNumber + index}
                editMode={editMode}
                viewType={viewType}
                selectedItem={selectedItem}
                setSelectedItem={setSelectedItem}
                questionMetadata={questionMetadata}
                collapsedGroups={collapsedGroups}
                urlPrefix={urlPrefix}
                hasCoursePermissionPreview={hasCoursePermissionPreview}
                assessmentType={assessmentType}
                dispatch={dispatch}
                onDeleteQuestion={onDeleteQuestion}
              />
            ))}
            {editMode && zone.questions.length === 0 && (
              <TreeEmptyDropZone dropRef={emptyDropRef} isOver={isOverEmpty} />
            )}
            {editMode && (
              <div className="px-3 py-2 border-bottom">
                <button
                  className="btn btn-sm btn-outline-primary"
                  type="button"
                  onClick={() => onAddQuestion(zone.trackingId)}
                >
                  <i className="fa fa-plus me-1" aria-hidden="true" />
                  Add question
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SortableContext>
  );
}
