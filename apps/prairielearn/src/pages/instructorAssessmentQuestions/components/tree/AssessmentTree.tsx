import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';

import type { TreeActions, TreeState, ViewType, ZoneAssessmentForm } from '../../types.js';
import { ViewToggle } from '../EditModeToolbar.js';

import { TreeZoneNode } from './TreeZoneNode.js';

export function AssessmentTree({
  zones,
  state,
  actions,
  onAddZone,
  isAllExpanded,
  onViewTypeChange,
  onToggleExpandCollapse,
  editControls,
}: {
  zones: ZoneAssessmentForm[];
  state: TreeState;
  actions: TreeActions;
  onAddZone: () => void;
  isAllExpanded: boolean;
  onViewTypeChange: (viewType: ViewType) => void;
  onToggleExpandCollapse: () => void;
  editControls: ReactNode;
}) {
  const { editMode, viewType } = state;
  return (
    <SortableContext items={zones.map((z) => z.trackingId)} strategy={verticalListSortingStrategy}>
      <div
        className="d-flex align-items-center px-3 py-2 border-bottom bg-body"
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
            state={state}
            actions={actions}
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
