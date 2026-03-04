import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Dispatch, ReactNode } from 'react';

import type { StaffAssessmentQuestionRow } from '../../../../lib/assessment-question.shared.js';
import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { EditorAction, SelectedItem, ViewType, ZoneAssessmentForm } from '../../types.js';
import type { ChangeTrackingResult } from '../../utils/modifiedTracking.js';
import { ViewToggle } from '../EditModeToolbar.js';

import { TreeZoneNode } from './TreeZoneNode.js';

export function AssessmentTree({
  zones,
  questionMetadata,
  editMode,
  viewType,
  selectedItem,
  setSelectedItem,
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
  onAddZone,
  onDeleteQuestion,
  onDeleteZone,
  isAllExpanded,
  onViewTypeChange,
  onToggleExpandCollapse,
  editControls,
}: {
  zones: ZoneAssessmentForm[];
  questionMetadata: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  viewType: ViewType;
  selectedItem: SelectedItem;
  setSelectedItem: (item: SelectedItem) => void;
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
  onAddZone: () => void;
  onDeleteQuestion: (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => void;
  onDeleteZone: (zoneTrackingId: string) => void;
  isAllExpanded: boolean;
  onViewTypeChange: (viewType: ViewType) => void;
  onToggleExpandCollapse: () => void;
  editControls?: ReactNode;
}) {
  return (
    <SortableContext items={zones.map((z) => z.trackingId)} strategy={verticalListSortingStrategy}>
      <style>{`
        .tree-delete-btn:hover { color: var(--bs-danger) !important; }
        .tree-hover-show { opacity: 0; transition: opacity 0.15s; }
        .tree-row:hover .tree-hover-show { opacity: 1; }
        .tree-hover-show:focus-within { opacity: 1; }
        [data-dragging] .tree-hover-show { opacity: 0 !important; pointer-events: none; }
        .tree-row.list-group-item-action:has(a:hover, .tree-interactive-badge:hover) {
          background-color: transparent;
        }
        .tree-row.list-group-item-action:active:has(.tree-hover-show:active) {
          background-color: var(--bs-list-group-action-hover-bg);
        }
      `}</style>
      <div
        className="d-flex align-items-center px-2 py-2 border-bottom bg-body"
        style={{ position: 'sticky', top: 0, zIndex: 11 }}
      >
        <ViewToggle
          viewType={viewType}
          isAllExpanded={isAllExpanded}
          onViewTypeChange={onViewTypeChange}
          onToggleExpandCollapse={onToggleExpandCollapse}
        />
        {editControls && <div className="ms-auto">{editControls}</div>}
      </div>
      <div className="list-group list-group-flush">
        {zones.map((zone, zoneIndex) => (
          <TreeZoneNode
            key={zone.trackingId}
            zone={zone}
            zoneNumber={zoneIndex + 1}
            editMode={editMode}
            viewType={viewType}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
            questionMetadata={questionMetadata}
            collapsedGroups={collapsedGroups}
            collapsedZones={collapsedZones}
            changeTracking={changeTracking}
            urlPrefix={urlPrefix}
            hasCoursePermissionPreview={hasCoursePermissionPreview}
            assessmentType={assessmentType}
            dispatch={dispatch}
            onAddQuestion={onAddQuestion}
            onAddAltGroup={onAddAltGroup}
            onAddToAltGroup={onAddToAltGroup}
            onDeleteQuestion={onDeleteQuestion}
            onDeleteZone={onDeleteZone}
          />
        ))}
        {editMode && (
          <div className="p-2">
            <button className="btn btn-sm btn-link text-muted" type="button" onClick={onAddZone}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              Add zone
            </button>
          </div>
        )}
      </div>
    </SortableContext>
  );
}
