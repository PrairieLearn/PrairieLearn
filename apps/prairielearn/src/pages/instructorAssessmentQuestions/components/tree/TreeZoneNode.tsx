import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { type Dispatch, useId } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneAssessmentForm } from '../../types.js';
import type { ChangeTrackingResult } from '../../utils/modifiedTracking.js';
import { computeZonePointTotals, computeZoneQuestionCount } from '../../utils/questions.js';

import { CollapseToggleButton } from './CollapseToggleButton.js';
import { DragHandle } from './DragHandle.js';
import { TreeEmptyDropZone } from './TreeEmptyDropZone.js';
import { TreeQuestionBlockNode } from './TreeQuestionBlockNode.js';
import { makeSortableStyle } from './sortableUtils.js';

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
  changeTracking,
  urlPrefix,
  hasCoursePermissionPreview,
  assessmentType,
  dispatch,
  onAddQuestion,
  onAddAltGroup,
  onAddToAltGroup,
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
  changeTracking: ChangeTrackingResult;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  assessmentType: EnumAssessmentType;
  dispatch: Dispatch<EditorAction>;
  onAddQuestion: (zoneTrackingId: string) => void;
  onAddAltGroup: (zoneTrackingId: string) => void;
  onAddToAltGroup: (altGroupTrackingId: string) => void;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteZone: (zoneTrackingId: string) => void;
}) {
  const changeTooltipId = useId();
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
            'tree-row d-flex align-items-center px-2 py-2 border-bottom user-select-none',
            isSelected ? 'bg-primary-subtle' : 'bg-body-secondary list-group-item-action',
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
          <span className="fw-semibold flex-grow-1">
            {zone.title || `Zone ${zoneNumber}`}
            {editMode && changeTracking.newIds.has(zone.trackingId) && (
              <OverlayTrigger
                placement="top"
                tooltip={{ props: { id: changeTooltipId }, body: 'New' }}
              >
                <span className="text-primary ms-1">●</span>
              </OverlayTrigger>
            )}
            {editMode && changeTracking.modifiedIds.has(zone.trackingId) && (
              <OverlayTrigger
                placement="top"
                tooltip={{ props: { id: changeTooltipId }, body: 'Modified' }}
              >
                <span className="text-warning ms-1">●</span>
              </OverlayTrigger>
            )}
          </span>
          <span className="d-inline-flex align-items-center gap-1 flex-wrap">
            {run(() => {
              if (zone.numberChoose != null) {
                return (
                  <span className="badge text-bg-light text-muted">Choose {zone.numberChoose}</span>
                );
              }
              const count = computeZoneQuestionCount(zone.questions);
              // ZonePointsBadge already shows "No questions" when the zone is empty.
              if (count === 0) return null;
              return (
                <span className="badge text-bg-light text-muted">
                  {count} question{count !== 1 ? 's' : ''}
                </span>
              );
            })}
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
          {!editMode && (
            <i className="bi bi-chevron-right text-muted small ms-1" aria-hidden="true" />
          )}
          {editMode && (
            <button
              type="button"
              className="btn btn-sm border-0 text-muted ms-1 tree-delete-btn tree-hover-show"
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
                changeTracking={changeTracking}
                urlPrefix={urlPrefix}
                hasCoursePermissionPreview={hasCoursePermissionPreview}
                assessmentType={assessmentType}
                dispatch={dispatch}
                onAddToAltGroup={onAddToAltGroup}
                onDeleteQuestion={onDeleteQuestion}
              />
            ))}
            {zone.questions.length === 0 &&
              (editMode ? (
                <TreeEmptyDropZone dropRef={emptyDropRef} isOver={isOverEmpty} />
              ) : (
                <div className="text-center text-muted py-3 border-bottom">
                  <i className="bi bi-info-circle me-1" aria-hidden="true" />
                  No questions in this zone
                </div>
              ))}
            {editMode && (
              <div
                className="d-flex gap-2 py-2 border-bottom"
                style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }}
              >
                <button
                  className="btn btn-sm btn-link text-muted"
                  type="button"
                  onClick={() => onAddQuestion(zone.trackingId)}
                >
                  <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                  Add question
                </button>
                <button
                  className="btn btn-sm btn-link text-muted"
                  type="button"
                  onClick={() => onAddAltGroup(zone.trackingId)}
                >
                  <i className="bi bi-stack me-1" aria-hidden="true" />
                  Add alternative group
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
