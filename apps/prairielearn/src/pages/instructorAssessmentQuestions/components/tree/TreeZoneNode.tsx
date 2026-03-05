import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { type Dispatch, useId } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import { isRenderableComment } from '../../../../lib/comments.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneAssessmentForm } from '../../types.js';
import type { ChangeTrackingResult } from '../../utils/modifiedTracking.js';
import {
  computeZonePointTotals,
  computeZoneQuestionCount,
  hasZonePointsMismatch,
} from '../../utils/questions.js';

import { CollapseToggleButton } from './CollapseToggleButton.js';
import { DragHandle } from './DragHandle.js';
import { TreeEmptyDropZone } from './TreeEmptyDropZone.js';
import { TreeQuestionBlockNode } from './TreeQuestionBlockNode.js';
import { makeDraggableStyle } from './dragUtils.js';

/**
 * Renders a zone node in the assessment tree — a sticky header with zone
 * metadata badges (question count, points, lockpoint, etc.) followed by the
 * zone's question blocks. Zones are sortable via drag-and-drop in edit mode
 * and collapsible in both modes.
 */
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
  const commentTooltipId = useId();
  const zonePointsMismatchTooltipId = useId();
  const badgeTooltipId = useId();
  const isCollapsed = collapsedZones.has(zone.trackingId);
  const zonePointsMismatch = hasZonePointsMismatch(zone, assessmentType);
  const isSelected =
    selectedItem?.type === 'zone' && selectedItem.zoneTrackingId === zone.trackingId;

  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_ZONE_COLLAPSE', trackingId: zone.trackingId });

  const { setNodeRef: emptyDropRef } = useDroppable({
    id: `${zone.trackingId}-empty-drop`,
    disabled: zone.questions.length > 0,
  });

  const {
    attributes: draggableAttributes,
    listeners: draggableListeners,
    setNodeRef: draggableRef,
    transform: draggableTransform,
    transition: draggableTransition,
    isDragging,
  } = useSortable({
    id: zone.trackingId,
    data: { type: 'zone' },
    disabled: !editMode,
  });

  const draggableStyle = makeDraggableStyle({
    isDragging,
    transform: draggableTransform,
    transition: draggableTransition,
  });

  const selectZone = () => {
    setSelectedItem({ type: 'zone', zoneTrackingId: zone.trackingId });
  };

  return (
    <SortableContext
      items={zone.questions.map((q) => q.trackingId)}
      strategy={verticalListSortingStrategy}
    >
      <div ref={draggableRef} style={draggableStyle}>
        {/* Zone header */}
        <div
          role="button"
          tabIndex={0}
          className={clsx(
            'tree-row d-flex align-items-center px-2 py-2 border-bottom user-select-none',
            isSelected
              ? 'tree-row-selected bg-body-secondary'
              : 'bg-body-secondary list-group-item-action',
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
              attributes={draggableAttributes}
              listeners={draggableListeners}
              ariaLabel="Drag to reorder zone"
            />
          )}
          <CollapseToggleButton
            isCollapsed={isCollapsed}
            ariaLabel={isCollapsed ? 'Expand zone' : 'Collapse zone'}
            onToggle={toggleCollapse}
          />
          <span className="fw-semibold">
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
            {isRenderableComment(zone.comment) && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: commentTooltipId },
                  body:
                    typeof zone.comment === 'string'
                      ? zone.comment
                      : JSON.stringify(zone.comment, null, 2),
                }}
              >
                <i className="bi bi-chat-left-text text-muted ms-1" aria-hidden="true" />
              </OverlayTrigger>
            )}
            {zonePointsMismatch && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: zonePointsMismatchTooltipId },
                  body: 'Questions in this zone have different point values',
                }}
              >
                <i
                  className="bi bi-exclamation-triangle-fill text-warning ms-1"
                  aria-hidden="true"
                />
              </OverlayTrigger>
            )}
          </span>
          <span className="d-inline-flex align-items-center gap-1 flex-wrap ms-2">
            {run(() => {
              const count = computeZoneQuestionCount(zone.questions);
              // ZonePointsBadge already shows "No questions" when the zone is empty.
              if (count === 0) return null;
              return (
                <OverlayTrigger
                  placement="top"
                  tooltip={{
                    props: { id: `${badgeTooltipId}-count` },
                    body: 'Total questions in this zone',
                  }}
                >
                  <span className="badge color-blue3">
                    {count} question{count !== 1 ? 's' : ''}
                  </span>
                </OverlayTrigger>
              );
            })}
            {zone.numberChoose != null && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: `${badgeTooltipId}-choose` },
                  body: 'Number of questions to randomly select from this zone',
                }}
              >
                <span className="badge color-blue3">Choose {zone.numberChoose}</span>
              </OverlayTrigger>
            )}
            <ZonePointsBadge
              zone={zone}
              assessmentType={assessmentType}
              tooltipId={`${badgeTooltipId}-points`}
            />
            {zone.maxPoints != null && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: `${badgeTooltipId}-max` },
                  body: 'Maximum total points from this zone that count toward the assessment',
                }}
              >
                <span className="badge color-blue3">Max {zone.maxPoints} pts</span>
              </OverlayTrigger>
            )}
            {zone.bestQuestions != null && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: `${badgeTooltipId}-best` },
                  body: 'Only the highest-scoring questions in this zone count toward the total',
                }}
              >
                <span className="badge color-blue3">Best {zone.bestQuestions}</span>
              </OverlayTrigger>
            )}
            {zone.lockpoint && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: `${badgeTooltipId}-lock` },
                  body: 'Students must complete this zone before proceeding to the next',
                }}
              >
                <span className="badge color-blue3">
                  <i className="bi bi-lock-fill me-1" aria-hidden="true" />
                  Lockpoint
                </span>
              </OverlayTrigger>
            )}
          </span>
          <span className="flex-grow-1" />
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
                <TreeEmptyDropZone dropRef={emptyDropRef} />
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
  tooltipId,
}: {
  zone: ZoneAssessmentForm;
  assessmentType: EnumAssessmentType;
  tooltipId: string;
}) {
  const { autoPoints, manualPoints } = computeZonePointTotals(zone.questions, {
    bestQuestions: zone.bestQuestions,
    numberChoose: zone.numberChoose,
  });
  const totalPoints = autoPoints + manualPoints;

  if (totalPoints === 0 && zone.questions.length === 0) {
    return <span className="badge color-blue3">No questions</span>;
  }

  const label = run(() => {
    if (assessmentType === 'Exam') return `${totalPoints} pts`;
    const parts: string[] = [];
    if (autoPoints > 0) parts.push(`${autoPoints} auto`);
    if (manualPoints > 0) parts.push(`${manualPoints} manual`);
    if (parts.length === 0) parts.push('0 pts');
    return parts.join(' + ');
  });

  return (
    <OverlayTrigger
      placement="top"
      tooltip={{
        props: { id: tooltipId },
        body: 'Total points a student can earn in this zone',
      }}
    >
      <span className="badge color-blue3">{label}</span>
    </OverlayTrigger>
  );
}
