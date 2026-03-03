import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import type { Dispatch } from 'react';

import { run } from '@prairielearn/run';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneAssessmentForm } from '../../types.js';
import { computeZonePointTotals, computeZoneQuestionCount } from '../../utils/questions.js';

import { CollapseToggleButton } from './CollapseToggleButton.js';
import { DragHandle } from './DragHandle.js';
import { TreeEmptyDropZone } from './TreeEmptyDropZone.js';
import { TreeQuestionBlockNode } from './TreeQuestionBlockNode.js';
import { makeSortableStyle } from './sortableUtils.js';

export function TreeZoneNode({
  zone,
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
  dispatch,
  onAddQuestion,
  onDeleteQuestion,
  onDeleteZone,
}: {
  zone: ZoneAssessmentForm;
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

  const sortableStyle = makeSortableStyle({
    isDragging: isSortableDragging,
    transform: sortableTransform,
    transition: sortableTransition,
  });

  const selectZone = () => {
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
          onClick={(e) => {
            e.stopPropagation();
            selectZone();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectZone();
            }
          }}
        >
          {editMode && (
            <DragHandle
              attributes={sortableAttributes}
              listeners={sortableListeners}
              ariaLabel="Drag to reorder zone"
            />
          )}
          <CollapseToggleButton
            isCollapsed={isCollapsed}
            ariaLabel={isCollapsed ? 'Expand zone' : 'Collapse zone'}
            onToggle={toggleCollapse}
          />
          <span className="fw-semibold flex-grow-1">{zone.title || 'Zone'}</span>
          <span className="d-inline-flex align-items-center gap-1 flex-wrap">
            <span className="badge text-bg-light text-muted">
              {zone.numberChoose == null
                ? run(() => {
                    const count = computeZoneQuestionCount(zone.questions);
                    return `${count} question${count !== 1 ? 's' : ''}`;
                  })
                : `Choose ${zone.numberChoose}`}
            </span>
            <ZonePointsBadge zone={zone} assessmentType={assessmentType} />
            {zone.maxPoints != null && (
              <span className="badge text-bg-secondary">Max {zone.maxPoints} pts</span>
            )}
            {zone.bestQuestions != null && (
              <span className="badge text-bg-secondary">Best {zone.bestQuestions}</span>
            )}
            {zone.lockpoint && (
              <span className="badge text-bg-warning">
                <i className="bi bi-lock-fill me-1" aria-hidden="true" />
                Lockpoint
              </span>
            )}
          </span>
          {editMode && (
            <button
              type="button"
              className="btn btn-sm border-0 text-muted ms-1 tree-delete-btn"
              title="Delete zone"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteZone(zone.trackingId);
              }}
            >
              <i className="bi bi-trash3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Zone content */}
        {!isCollapsed && (
          <>
            {zone.questions.map((zoneQuestionBlock) => (
              <TreeQuestionBlockNode
                key={zoneQuestionBlock.trackingId}
                zoneQuestionBlock={zoneQuestionBlock}
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
              <div
                className="py-2 border-bottom"
                style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }}
              >
                <button
                  className="btn btn-sm btn-outline-primary"
                  type="button"
                  onClick={() => onAddQuestion(zone.trackingId)}
                >
                  <i className="bi bi-plus me-1" aria-hidden="true" />
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

function ZonePointsBadge({
  zone,
  assessmentType,
}: {
  zone: ZoneAssessmentForm;
  assessmentType: EnumAssessmentType;
}) {
  const { autoPoints, manualPoints } = computeZonePointTotals(zone.questions);
  const totalPoints = autoPoints + manualPoints;

  if (totalPoints === 0 && zone.questions.length === 0) {
    return <span className="badge text-bg-light text-muted">No questions</span>;
  }

  if (assessmentType === 'Exam') {
    return <span className="badge text-bg-info">{totalPoints} pts</span>;
  }

  const parts: string[] = [];
  if (autoPoints > 0) parts.push(`${autoPoints} auto`);
  if (manualPoints > 0) parts.push(`${manualPoints} manual`);
  if (parts.length === 0) parts.push('0 pts');

  return <span className="badge text-bg-info">{parts.join(' + ')}</span>;
}
