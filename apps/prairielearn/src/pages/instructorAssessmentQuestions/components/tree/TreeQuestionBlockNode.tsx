import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { useCallback, useMemo } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type {
  TreeActions,
  TreeState,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../../types.js';
import {
  computeAltPoolChosenRange,
  getSharedTags,
  getSharedTopic,
  hasAltPoolChooseExceedsCount,
  hasPointsMismatch,
  questionHasTitle,
} from '../../utils/questions.js';

import { ChangeIndicatorBadges } from './ChangeIndicatorBadges.js';
import { CollapseToggleButton } from './CollapseToggleButton.js';
import { DragHandle } from './DragHandle.js';
import { SortableAlternativeRow } from './SortableAlternativeRow.js';
import { PointsBadge, TreeQuestionRow } from './TreeQuestionRow.js';
import { WarningIndicator } from './WarningIndicator.js';
import { makeDraggableStyle } from './dragUtils.js';

/**
 * Renders a single question block within a zone in the assessment tree.
 *
 * A "question block" is either a standalone question or an alternative pool
 * (a pool of interchangeable questions from which a subset is randomly chosen).
 * Standalone questions render as a single `TreeQuestionRow`; alternative pools
 * render as a collapsible header with nested `SortableAlternativeRow` children.
 */
export function TreeQuestionBlockNode({
  zoneQuestionBlock,
  questionNumber,
  zone,
  state,
  actions,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  questionNumber: number;
  zone: ZoneAssessmentForm;
  state: TreeState;
  actions: TreeActions;
}) {
  const {
    editMode,
    selectedItem,
    questionMetadata,
    collapsedPools,
    changeTracking,
    assessmentType,
  } = state;
  const { setSelectedItem, dispatch, onAddToAltPool, onDeleteQuestion } = actions;
  const hasAlternatives = zoneQuestionBlock.alternatives != null;
  const isCollapsed = collapsedPools.has(zoneQuestionBlock.trackingId);
  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_POOL_COLLAPSE', trackingId: zoneQuestionBlock.trackingId });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: zoneQuestionBlock.trackingId,
    data: { type: 'question', hasAlternatives, qid: zoneQuestionBlock.id },
    disabled: !editMode,
  });

  const { setNodeRef: mergeDropRef, isOver: isMergeOver } = useDroppable({
    id: `${zoneQuestionBlock.trackingId}-merge`,
    data: { type: 'merge-zone', altPoolTrackingId: zoneQuestionBlock.trackingId },
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

  const { active } = useDndContext();

  const isAltPoolSelected =
    selectedItem?.type === 'altPool' &&
    selectedItem.questionTrackingId === zoneQuestionBlock.trackingId;

  if (!zoneQuestionBlock.alternatives) {
    // Standalone question (no alternatives) — narrowed to StandaloneQuestionBlockForm.

    const questionData = questionMetadata[zoneQuestionBlock.id] ?? null;
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
          questionNumber={questionNumber}
          state={state}
          isSelected={isSelected}
          draggableAttributes={attributes}
          draggableListeners={listeners}
          onClick={() =>
            setSelectedItem({
              type: 'question',
              questionTrackingId: zoneQuestionBlock.trackingId,
            })
          }
          onDelete={() => onDeleteQuestion(zoneQuestionBlock.trackingId, zoneQuestionBlock.id)}
        />
      </div>
    );
  }

  // Alternative pool
  const alternativeCount = alternatives?.length ?? 0;

  // Is one of our alternatives being dragged away?
  const isDraggingChildOut =
    active?.data.current?.type === 'alternative' &&
    active.data.current.parentTrackingId === zoneQuestionBlock.trackingId;

  const displayCount = alternativeCount + (isMergeOver ? 1 : 0) - (isDraggingChildOut ? 1 : 0);

  const pointsMismatch =
    alternatives != null && hasPointsMismatch(alternatives, assessmentType, zoneQuestionBlock);
  // This warning triggers when alternatives are deleted from a pool, reducing
  // the count below an already-saved numberChoose.
  const chooseExceeds = hasAltPoolChooseExceedsCount(zoneQuestionBlock);

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
      {/* Alt pool header */}
      <div
        role="button"
        tabIndex={0}
        className={clsx(
          'tree-row d-flex align-items-center py-1 border-bottom user-select-none',
          isAltPoolSelected ? 'tree-row-selected' : 'list-group-item-action',
        )}
        style={{
          paddingLeft: '2.5rem',
          // Extra right padding prevents macOS overlay scrollbars
          // from overlapping row content like the points badge.
          // https://bugzilla.mozilla.org/show_bug.cgi?id=636564
          paddingRight: '1.5rem',
          cursor: 'pointer',
          ...(chooseExceeds || pointsMismatch ? { borderLeft: '6px solid var(--bs-warning)' } : {}),
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedItem({
            type: 'altPool',
            questionTrackingId: zoneQuestionBlock.trackingId,
          });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedItem({
              type: 'altPool',
              questionTrackingId: zoneQuestionBlock.trackingId,
            });
          }
        }}
      >
        <DragHandle attributes={attributes} listeners={listeners} disabled={!editMode} />
        <CollapseToggleButton
          isCollapsed={isCollapsed}
          ariaLabel={isCollapsed ? 'Expand alternatives' : 'Collapse alternatives'}
          onToggle={toggleCollapse}
        />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="d-flex align-items-center">
            <span className="text-truncate text-primary">
              <i className="bi bi-stack me-1" aria-hidden="true" />
              {run(() => {
                const { min, max } = computeAltPoolChosenRange(zone, zoneQuestionBlock);
                const allChosen = min === displayCount && max === displayCount;
                const chosenLabel = allChosen
                  ? 'all chosen'
                  : min === max
                    ? `${min} chosen`
                    : `${min}-${max} chosen`;
                return (
                  <>
                    {displayCount} alternative{displayCount !== 1 ? 's' : ''}{' '}
                    <span className="text-secondary">({chosenLabel})</span>
                  </>
                );
              })}
              <ChangeIndicatorBadges
                trackingId={zoneQuestionBlock.trackingId}
                comment={zoneQuestionBlock.comment}
                editMode={editMode}
                changeTracking={changeTracking}
              />
            </span>
            <span className="d-inline-flex align-items-center gap-1 flex-wrap ms-2">
              {pointsMismatch && (
                <WarningIndicator
                  tooltipId={`points-mismatch-${zoneQuestionBlock.trackingId}`}
                  label="Inconsistent points"
                  body="Students will receive different total points because this pool has alternatives with different point values"
                />
              )}
              {chooseExceeds && (
                <WarningIndicator
                  tooltipId={`choose-exceeds-${zoneQuestionBlock.trackingId}`}
                  label="Choose exceeds count"
                  body="Number to choose exceeds the number of alternatives in this pool"
                />
              )}
            </span>
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
          {run(() => {
            if (state.viewType !== 'detailed') return null;
            if (!alternatives || alternatives.length === 0) return null;
            const sharedTags = getSharedTags(alternatives, questionMetadata);
            if (sharedTags.length === 0) return null;
            return (
              <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                {sharedTags.map((tag) => (
                  <span key={tag.name} className={`badge color-${tag.color}`}>
                    {tag.name}
                  </span>
                ))}
                <OverlayTrigger
                  placement="top"
                  tooltip={{
                    props: { id: `shared-tags-${zoneQuestionBlock.trackingId}` },
                    body: 'Tags shared across all alternatives',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost p-0"
                    aria-label="Tags shared across all alternatives"
                  >
                    <i className="bi bi-question-circle text-muted" aria-hidden="true" />
                  </button>
                </OverlayTrigger>
              </div>
            );
          })}
        </div>
        {run(() => {
          if (!alternatives || alternatives.length === 0) return null;
          const topic = getSharedTopic(alternatives, questionMetadata);
          if (!topic) return null;
          return (
            <div className="ms-2 me-2">
              <span className={`badge color-${topic.color}`}>{topic.name}</span>
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
        {editMode && (
          <button
            type="button"
            className={clsx(
              'btn btn-sm border-0 text-muted ms-1 tree-delete-btn',
              !isAltPoolSelected && 'hover-show',
            )}
            aria-label="Delete alternative pool"
            title="Delete alternative pool"
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
        <div className="text-muted fst-italic border-bottom py-2" style={{ paddingLeft: '4.5rem' }}>
          No alternatives yet. Use "Add alternative" to add questions.
        </div>
      )}
      {!isCollapsed && (
        <SortableContext items={alternativeIds} strategy={verticalListSortingStrategy}>
          {alternatives?.map((alternative, altIndex) => {
            const altQuestionData = questionMetadata[alternative.id] ?? null;
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
                questionNumber={questionNumber}
                alternativeNumber={altIndex + 1}
                state={state}
                isSelected={isAltSelected}
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
      {!isCollapsed && isMergeOver && (
        <div
          className="tree-row d-flex align-items-center py-1 border-bottom"
          style={{ paddingLeft: '4.5rem', paddingRight: '1.5rem', opacity: 0.5 }}
        >
          {editMode && (
            <span className="me-2" style={{ visibility: 'hidden' }}>
              <i className="bi bi-grip-vertical" aria-hidden="true" />
            </span>
          )}
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <div className="text-truncate">
              {run(() => {
                const activeQid = active?.data.current?.qid;
                if (!activeQid) return null;
                const qData = questionMetadata[activeQid];
                return questionHasTitle(qData ?? null) ? (
                  qData!.question.title
                ) : (
                  <span className="font-monospace">{activeQid}</span>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {!isCollapsed && editMode && (
        <div className="border-bottom py-2" style={{ paddingLeft: '4.5rem' }}>
          <button
            type="button"
            className="btn btn-sm btn-link text-muted"
            onClick={() => onAddToAltPool(zoneQuestionBlock.trackingId)}
          >
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            Add alternative
          </button>
        </div>
      )}
    </div>
  );
}
