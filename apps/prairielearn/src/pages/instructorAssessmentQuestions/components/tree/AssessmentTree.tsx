import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';

import type { TreeActions, TreeState, ViewType, ZoneAssessmentForm } from '../../types.js';
import { computeQuestionNumber } from '../../utils/zoneLookup.js';
import { ViewToggle } from '../EditModeToolbar.js';
import { ViewSwitcherDropdown } from '../ViewSwitcherDropdown.js';

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
  switchViewUrl,
}: {
  zones: ZoneAssessmentForm[];
  state: TreeState;
  actions: TreeActions;
  onAddZone: () => void;
  isAllExpanded: boolean;
  onViewTypeChange: (viewType: ViewType) => void;
  onToggleExpandCollapse: () => void;
  editControls: ReactNode;
  switchViewUrl: string | null;
}) {
  const { editMode, viewType } = state;
  const hasAlternatives = zones.some((zone) => zone.questions.some((q) => q.alternatives != null));
  return (
    <div className="d-flex flex-column h-100">
      <div className="d-flex align-items-center px-3 py-2 border-bottom bg-body flex-shrink-0">
        <ViewToggle
          viewType={viewType}
          isAllExpanded={isAllExpanded}
          hasAlternatives={hasAlternatives}
          onViewTypeChange={onViewTypeChange}
          onToggleExpandCollapse={onToggleExpandCollapse}
        />
        <div className="ms-auto d-flex gap-2 align-items-center">
          <ViewSwitcherDropdown
            currentView="new"
            switchViewUrl={switchViewUrl}
            editMode={editMode}
          />
          {editControls}
        </div>
      </div>
      <div className="overflow-auto flex-grow-1" style={{ minHeight: 0 }}>
        <SortableContext
          items={zones.map((z) => z.trackingId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="list-group list-group-flush">
            {zones.map((zone, zoneIndex) => (
              <TreeZoneNode
                key={zone.trackingId}
                zone={zone}
                zoneNumber={zoneIndex + 1}
                questionStartNumber={computeQuestionNumber(zones, zoneIndex, 0)}
                state={state}
                actions={actions}
              />
            ))}
            {editMode && (
              <div className="p-2">
                <button
                  className="btn btn-sm btn-link text-muted"
                  type="button"
                  onClick={onAddZone}
                >
                  <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                  Add zone
                </button>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
