import clsx from 'clsx';
import { useId } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { ViewType } from '../types.js';

export function ViewToggle({
  viewType,
  onViewTypeChange,
  isAllExpanded,
  hasAlternatives,
  onToggleExpandCollapse,
}: {
  viewType: ViewType;
  onViewTypeChange: (viewType: ViewType) => void;
  isAllExpanded: boolean;
  hasAlternatives: boolean;
  onToggleExpandCollapse: () => void;
}) {
  return (
    <div className="d-flex gap-2 align-items-center">
      <ToggleButtonGroup
        type="radio"
        name="viewType"
        value={viewType}
        size="sm"
        onChange={(val: ViewType) => onViewTypeChange(val)}
      >
        <ToggleButton id="viewType-simple" value="simple" variant="outline-secondary">
          Simple
        </ToggleButton>
        <ToggleButton id="viewType-detailed" value="detailed" variant="outline-secondary">
          Detailed
        </ToggleButton>
      </ToggleButtonGroup>
      {hasAlternatives && (
        <button
          className="btn btn-sm btn-outline-secondary"
          type="button"
          aria-label={isAllExpanded ? 'Collapse alternatives' : 'Expand alternatives'}
          onClick={onToggleExpandCollapse}
        >
          {isAllExpanded ? (
            <>
              <i className="bi bi-chevron-contract" aria-hidden="true" />{' '}
              <span className="toolbar-btn-label">Collapse alternatives</span>
            </>
          ) : (
            <>
              <i className="bi bi-chevron-expand" aria-hidden="true" />{' '}
              <span className="toolbar-btn-label">Expand alternatives</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function EditModeToolbar({
  csrfToken,
  origHash,
  zones,
  editMode,
  canEdit,
  setEditMode,
  saveButtonDisabled,
  saveButtonDisabledReason,
  onSubmit,
  onCancel,
}: {
  csrfToken: string;
  origHash: string;
  zones: ZoneAssessmentJson[];
  editMode: boolean;
  canEdit: boolean;
  setEditMode: (editMode: boolean) => void;
  saveButtonDisabled: boolean;
  saveButtonDisabledReason?: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const saveTooltipId = useId();

  if (!editMode) {
    if (!canEdit) return null;
    return (
      <button
        className="btn btn-sm btn-outline-secondary"
        type="button"
        onClick={() => setEditMode(true)}
      >
        <i className="bi bi-pencil" aria-hidden="true" /> Edit
      </button>
    );
  }

  const saveButton = (
    <button
      className={clsx(
        'btn btn-sm mx-1',
        saveButtonDisabled ? 'btn-outline-secondary' : 'btn-primary',
      )}
      type="submit"
      disabled={saveButtonDisabled}
      aria-label="Save and sync"
      {...(saveButtonDisabledReason && { 'aria-describedby': saveTooltipId })}
    >
      <i className="bi bi-floppy" aria-hidden="true" />{' '}
      <span className="toolbar-btn-label">Save and sync</span>
    </button>
  );

  return (
    <form method="POST" className="d-flex gap-2 align-items-center" onSubmit={onSubmit}>
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />
      {saveButtonDisabledReason ? (
        <OverlayTrigger
          placement="bottom"
          tooltip={{
            props: { id: saveTooltipId },
            body: saveButtonDisabledReason,
          }}
        >
          <span style={{ cursor: 'not-allowed' }}>{saveButton}</span>
        </OverlayTrigger>
      ) : (
        saveButton
      )}
      <button className="btn btn-sm btn-outline-secondary" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
