import { useSortable } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { type CSSProperties, type Dispatch } from 'react';

import { run } from '@prairielearn/run';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneQuestionBlockForm } from '../../types.js';

import { TreeQuestionRow } from './TreeQuestionRow.js';

export function TreeQuestionBlockNode({
  zoneQuestionBlock,
  editMode,
  viewType,
  selectedItem,
  setSelectedItem,
  questionMetadata,
  collapsedGroups,
  urlPrefix,
  hasCoursePermissionPreview,
  assessmentType,
  dispatch,
  onDeleteQuestion,
}: {
  zoneQuestionBlock: ZoneQuestionBlockForm;
  editMode: boolean;
  viewType: ViewType;
  selectedItem: SelectedItem;
  setSelectedItem: (item: SelectedItem) => void;
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  collapsedGroups: Set<string>;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  assessmentType: EnumAssessmentType;
  dispatch: Dispatch<EditorAction>;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
}) {
  const hasAlternatives = zoneQuestionBlock.id == null;
  const isCollapsed = collapsedGroups.has(zoneQuestionBlock.trackingId);
  const toggleCollapse = () =>
    dispatch({ type: 'TOGGLE_GROUP_COLLAPSE', trackingId: zoneQuestionBlock.trackingId });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: zoneQuestionBlock.trackingId,
    data: { type: 'question' },
    disabled: !editMode,
  });

  const sortableStyle: CSSProperties = {
    opacity: isDragging ? 0.6 : 1,
    transform: transform ? `translateY(${transform.y}px)` : undefined,
    transition,
    background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 2 : undefined,
  };

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
  const alternatives = zoneQuestionBlock.alternatives ?? [];
  const alternativeCount = alternatives.length;

  return (
    <div ref={setNodeRef} style={sortableStyle}>
      {/* Alt group header */}
      <div
        role="button"
        tabIndex={0}
        className={clsx(
          'd-flex align-items-center py-1 border-bottom user-select-none',
          isAltGroupSelected ? 'bg-primary-subtle' : '',
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
        {editMode && listeners && (
          // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
          <span
            {...attributes}
            {...listeners}
            className="me-2"
            style={{ cursor: 'grab', touchAction: 'none' }}
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              listeners.onKeyDown(e);
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
          >
            <i className="bi bi-grip-vertical text-muted" aria-hidden="true" />
          </span>
        )}
        <button
          type="button"
          className="btn btn-sm p-0 border-0 me-1"
          aria-label={isCollapsed ? 'Expand alternatives' : 'Collapse alternatives'}
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse();
          }}
        >
          <i className={`bi bi-chevron-${isCollapsed ? 'right' : 'down'}`} aria-hidden="true" />
        </button>
        <i className="bi bi-stack text-primary me-1" aria-hidden="true" />
        <span className="flex-grow-1 text-primary">
          {run(() => {
            const choose = zoneQuestionBlock.numberChoose;
            if (choose == null) return `Choose ${alternativeCount} of ${alternativeCount}`;
            return `Choose ${choose} of ${alternativeCount}`;
          })}
        </span>
        {editMode && (
          <button
            type="button"
            className="btn btn-sm border-0 text-muted ms-1 tree-delete-btn"
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
      {!isCollapsed &&
        alternatives.map((alternative) => {
          const altQuestionData = alternative.id ? questionMetadata[alternative.id] : null;
          const isAltSelected =
            selectedItem?.type === 'alternative' &&
            selectedItem.questionTrackingId === zoneQuestionBlock.trackingId &&
            selectedItem.alternativeTrackingId === alternative.trackingId;

          return (
            <TreeQuestionRow
              key={alternative.trackingId}
              question={alternative}
              zoneQuestionBlock={zoneQuestionBlock}
              questionData={altQuestionData}
              editMode={editMode}
              viewType={viewType}
              isSelected={isAltSelected}
              urlPrefix={urlPrefix}
              hasCoursePermissionPreview={hasCoursePermissionPreview}
              assessmentType={assessmentType}
              isAlternative
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
    </div>
  );
}
