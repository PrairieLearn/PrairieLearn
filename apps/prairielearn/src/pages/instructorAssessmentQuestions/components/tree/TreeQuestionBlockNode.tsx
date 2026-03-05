import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { type Dispatch, useCallback, useId, useMemo } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import { isRenderableComment } from '../../../../lib/comments.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneQuestionBlockForm } from '../../types.js';
import type { ChangeTrackingResult } from '../../utils/modifiedTracking.js';
import { hasPointsMismatch } from '../../utils/questions.js';

import { CollapseToggleButton } from './CollapseToggleButton.js';
import { DragHandle } from './DragHandle.js';
import { SortableAlternativeRow } from './SortableAlternativeRow.js';
import { PointsBadge, TreeQuestionRow } from './TreeQuestionRow.js';
import { makeDraggableStyle } from './dragUtils.js';

export function TreeQuestionBlockNode({
  zoneQuestionBlock,
  editMode,
  viewType,
  selectedItem,
  setSelectedItem,
  questionMetadata,
  collapsedGroups,
  changeTracking,
  urlPrefix,
  hasCoursePermissionPreview,
  assessmentType,
  dispatch,
  onAddToAltGroup,
  onDeleteQuestion,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  editMode: boolean;
  viewType: ViewType;
  selectedItem: SelectedItem;
  setSelectedItem: (item: SelectedItem) => void;
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  collapsedGroups: Set<string>;
  changeTracking: ChangeTrackingResult;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  assessmentType: EnumAssessmentType;
  dispatch: Dispatch<EditorAction>;
  onAddToAltGroup?: (altGroupTrackingId: string) => void;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
}) {
  const changeTooltipId = useId();
  const commentTooltipId = useId();
  const hasAlternatives = zoneQuestionBlock.id == null;
  const isCollapsed = collapsedGroups.has(zoneQuestionBlock.trackingId);
  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_GROUP_COLLAPSE', trackingId: zoneQuestionBlock.trackingId });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: zoneQuestionBlock.trackingId,
    data: { type: 'question', hasAlternatives },
    disabled: !editMode,
  });

  const { setNodeRef: mergeDropRef, isOver: isMergeOver } = useDroppable({
    id: `${zoneQuestionBlock.trackingId}-merge`,
    data: { type: 'merge-zone', altGroupTrackingId: zoneQuestionBlock.trackingId },
    disabled: !editMode || !hasAlternatives || isCollapsed,
  });

  const draggableStyle = makeDraggableStyle({ isDragging, transform, transition });

  // Stable callback ref so React doesn't detach/reattach on every render,
  // which would cause dnd-kit's ResizeObserver to unobserve/observe repeatedly.
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      mergeDropRef(node);
    },
    [setNodeRef, mergeDropRef],
  );

  const alternatives = zoneQuestionBlock.alternatives;
  const alternativeIds = useMemo(
    () => (alternatives ?? []).map((a) => a.trackingId),
    [alternatives],
  );

  const isAltGroupSelected =
    selectedItem?.type === 'altGroup' &&
    selectedItem.questionTrackingId === zoneQuestionBlock.trackingId;

  if (!hasAlternatives) {
    // Single question (no alternatives)
    const questionData = zoneQuestionBlock.id ? questionMetadata[zoneQuestionBlock.id] : null;
    const isSelected =
      selectedItem?.type === 'question' &&
      selectedItem.questionTrackingId === zoneQuestionBlock.trackingId;

    return (
      <div ref={setNodeRef} style={draggableStyle}>
        <TreeQuestionRow
          question={zoneQuestionBlock}
          zoneQuestionBlock={zoneQuestionBlock}
          isAlternative={false}
          questionData={questionData}
          editMode={editMode}
          viewType={viewType}
          isSelected={isSelected}
          changeTracking={changeTracking}
          urlPrefix={urlPrefix}
          hasCoursePermissionPreview={hasCoursePermissionPreview}
          assessmentType={assessmentType}
          draggableAttributes={editMode ? attributes : undefined}
          draggableListeners={editMode ? listeners : undefined}
          onClick={() =>
            setSelectedItem({
              type: 'question',
              questionTrackingId: zoneQuestionBlock.trackingId,
            })
          }
          onDelete={
            editMode
              ? () => onDeleteQuestion(zoneQuestionBlock.trackingId, zoneQuestionBlock.id ?? '')
              : undefined
          }
        />
      </div>
    );
  }

  // Alternative group
  const alternativeCount = alternatives?.length ?? 0;

  const pointsMismatch =
    alternatives != null && hasPointsMismatch(alternatives, assessmentType, zoneQuestionBlock);

  return (
    <div
      ref={combinedRef}
      style={{
        ...draggableStyle,
        // Use box-shadow instead of border to avoid changing the element's
        // layout dimensions. A layout shift from adding/removing a border
        // can cause dnd-kit's collision detection to oscillate, triggering
        // an infinite update loop ("Maximum update depth exceeded").
        boxShadow: isMergeOver ? 'inset 0 0 0 2px var(--bs-primary)' : undefined,
        borderRadius: isMergeOver ? 'var(--bs-border-radius)' : undefined,
      }}
      className={clsx(isMergeOver && 'bg-primary-subtle')}
    >
      {/* Alt group header */}
      <div
        role="button"
        tabIndex={0}
        className={clsx(
          'tree-row d-flex align-items-center py-1 border-bottom user-select-none',
          isAltGroupSelected ? 'bg-primary-subtle' : 'list-group-item-action',
        )}
        style={{ paddingLeft: '2.5rem', paddingRight: '0.5rem', cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedItem({
            type: 'altGroup',
            questionTrackingId: zoneQuestionBlock.trackingId,
          });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedItem({
              type: 'altGroup',
              questionTrackingId: zoneQuestionBlock.trackingId,
            });
          }
        }}
      >
        {editMode && <DragHandle attributes={attributes} listeners={listeners} />}
        <CollapseToggleButton
          isCollapsed={isCollapsed}
          ariaLabel={isCollapsed ? 'Expand alternatives' : 'Collapse alternatives'}
          onToggle={toggleCollapse}
        />
        <i className="bi bi-stack text-primary me-1" aria-hidden="true" />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="text-truncate text-primary">
            {run(() => {
              const choose = zoneQuestionBlock.numberChoose;
              if (choose == null) return `Choose ${alternativeCount} of ${alternativeCount}`;
              return `Choose ${choose} of ${alternativeCount}`;
            })}
            {pointsMismatch && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: `points-mismatch-${zoneQuestionBlock.trackingId}` },
                  body: 'Alternatives have different point values',
                }}
              >
                <i
                  className="bi bi-exclamation-triangle-fill text-warning ms-1"
                  aria-hidden="true"
                />
              </OverlayTrigger>
            )}
            {editMode && changeTracking.newIds.has(zoneQuestionBlock.trackingId) && (
              <OverlayTrigger
                placement="top"
                tooltip={{ props: { id: changeTooltipId }, body: 'New' }}
              >
                <span className="text-primary ms-1">●</span>
              </OverlayTrigger>
            )}
            {editMode && changeTracking.modifiedIds.has(zoneQuestionBlock.trackingId) && (
              <OverlayTrigger
                placement="top"
                tooltip={{ props: { id: changeTooltipId }, body: 'Modified' }}
              >
                <span className="text-warning ms-1">●</span>
              </OverlayTrigger>
            )}
            {isRenderableComment(zoneQuestionBlock.comment) && (
              <OverlayTrigger
                placement="top"
                tooltip={{
                  props: { id: commentTooltipId },
                  body:
                    typeof zoneQuestionBlock.comment === 'string'
                      ? zoneQuestionBlock.comment
                      : JSON.stringify(zoneQuestionBlock.comment, null, 2),
                }}
              >
                <i className="bi bi-chat-left-text text-muted ms-1" aria-hidden="true" />
              </OverlayTrigger>
            )}
          </div>
          {alternatives && alternatives.length > 0 && (
            <div
              className="text-muted font-monospace text-truncate"
              style={{ fontSize: '0.75rem' }}
            >
              {alternatives.slice(0, 2).map((alt, i) => (
                <span key={alt.trackingId}>
                  {i > 0 && ', '}
                  {alt.id}
                </span>
              ))}
              {alternatives.length > 2 && ', ...'}
            </div>
          )}
        </div>
        {run(() => {
          if (!alternatives || alternatives.length === 0) return null;
          const topics = alternatives
            .map((alt) => (alt.id ? questionMetadata[alt.id]?.topic : null))
            .filter(Boolean);
          if (topics.length !== alternatives.length) return null;
          const first = topics[0]!;
          if (!topics.every((t) => t!.name === first.name)) return null;
          return (
            <div className="ms-2 me-2">
              <span className={`badge color-${first.color}`}>{first.name}</span>
            </div>
          );
        })}
        <div className="flex-shrink-0 text-end" style={{ minWidth: '6rem' }}>
          <PointsBadge
            question={zoneQuestionBlock}
            zoneQuestionBlock={zoneQuestionBlock}
            assessmentType={assessmentType}
          />
        </div>
        {!editMode && (
          <i className="bi bi-chevron-right text-muted small ms-1" aria-hidden="true" />
        )}
        {editMode && (
          <button
            type="button"
            className="btn btn-sm border-0 text-muted ms-1 tree-delete-btn tree-hover-show"
            title="Delete alternative group"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteQuestion(zoneQuestionBlock.trackingId, '');
            }}
          >
            <i className="bi bi-trash3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Alternatives */}
      {!isCollapsed && alternativeCount === 0 && editMode && (
        <div className="text-muted fst-italic border-bottom py-2" style={{ paddingLeft: '3.5rem' }}>
          No alternatives yet. Use "Add alternative" to add questions.
        </div>
      )}
      {!isCollapsed && (
        <SortableContext items={alternativeIds} strategy={verticalListSortingStrategy}>
          {alternatives?.map((alternative) => {
            const altQuestionData = alternative.id ? questionMetadata[alternative.id] : null;
            const isAltSelected =
              selectedItem?.type === 'alternative' &&
              selectedItem.questionTrackingId === zoneQuestionBlock.trackingId &&
              selectedItem.alternativeTrackingId === alternative.trackingId;

            return (
              <SortableAlternativeRow
                key={alternative.trackingId}
                alternative={alternative}
                zoneQuestionBlock={zoneQuestionBlock}
                questionData={altQuestionData}
                editMode={editMode}
                viewType={viewType}
                isSelected={isAltSelected}
                changeTracking={changeTracking}
                urlPrefix={urlPrefix}
                hasCoursePermissionPreview={hasCoursePermissionPreview}
                assessmentType={assessmentType}
                onClick={() =>
                  setSelectedItem({
                    type: 'alternative',
                    questionTrackingId: zoneQuestionBlock.trackingId,
                    alternativeTrackingId: alternative.trackingId,
                  })
                }
                onDelete={
                  editMode
                    ? () =>
                        onDeleteQuestion(
                          zoneQuestionBlock.trackingId,
                          alternative.id,
                          alternative.trackingId,
                        )
                    : undefined
                }
              />
            );
          })}
        </SortableContext>
      )}
      {!isCollapsed && editMode && onAddToAltGroup && (
        <div className="border-bottom py-2" style={{ paddingLeft: '4.5rem' }}>
          <button
            type="button"
            className="btn btn-sm btn-link text-muted"
            onClick={() => onAddToAltGroup(zoneQuestionBlock.trackingId)}
          >
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            Add alternative
          </button>
        </div>
      )}
    </div>
  );
}
