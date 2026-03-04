import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { type Dispatch, useId, useMemo } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneQuestionBlockForm } from '../../types.js';
import type { ChangeTrackingResult } from '../../utils/modifiedTracking.js';

import { CollapseToggleButton } from './CollapseToggleButton.js';
import { DragHandle } from './DragHandle.js';
import { SortableAlternativeRow } from './SortableAlternativeRow.js';
import { PointsBadge, TreeQuestionRow } from './TreeQuestionRow.js';
import { makeSortableStyle } from './sortableUtils.js';

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

  const sortableStyle = makeSortableStyle({ isDragging, transform, transition });

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
      <div ref={setNodeRef} style={sortableStyle}>
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
          sortableAttributes={editMode ? attributes : undefined}
          sortableListeners={editMode ? listeners : undefined}
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

  const pointsMismatch = run(() => {
    if (!alternatives || alternatives.length <= 1) return false;

    const getEffectivePoints = (alt: (typeof alternatives)[0]) =>
      JSON.stringify({
        autoPoints:
          alt.points ?? alt.autoPoints ?? zoneQuestionBlock.points ?? zoneQuestionBlock.autoPoints,
        manualPoints: alt.manualPoints ?? zoneQuestionBlock.manualPoints,
        maxAutoPoints:
          alt.maxPoints ??
          alt.maxAutoPoints ??
          zoneQuestionBlock.maxPoints ??
          zoneQuestionBlock.maxAutoPoints,
      });

    const first = getEffectivePoints(alternatives[0]);
    return alternatives.some((alt) => getEffectivePoints(alt) !== first);
  });

  return (
    <div
      ref={(node: HTMLDivElement | null) => {
        setNodeRef(node);
        mergeDropRef(node);
      }}
      style={sortableStyle}
      className={clsx(isMergeOver && 'border border-primary rounded bg-primary-subtle')}
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
        <span className="flex-grow-1 text-primary">
          {run(() => {
            const choose = zoneQuestionBlock.numberChoose;
            if (choose == null) return `Choose ${alternativeCount} of ${alternativeCount}`;
            return `Choose ${choose} of ${alternativeCount}`;
          })}
          {pointsMismatch && (
            <i
              className="bi bi-exclamation-triangle-fill text-warning ms-1"
              aria-hidden="true"
              title="Alternatives have different point values"
            />
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
        </span>
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
        {editMode && onAddToAltGroup && (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary ms-1"
            onClick={(e) => {
              e.stopPropagation();
              onAddToAltGroup(zoneQuestionBlock.trackingId);
            }}
          >
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            Add alternative
          </button>
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
    </div>
  );
}
