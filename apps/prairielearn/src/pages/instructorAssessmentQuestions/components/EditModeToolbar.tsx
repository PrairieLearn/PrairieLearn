import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { ViewType } from '../types.js';

export function ViewToggle({
  viewType,
  onViewTypeChange,
  isAllExpanded,
  onToggleExpandCollapse,
}: {
  viewType: ViewType;
  onViewTypeChange: (viewType: ViewType) => void;
  isAllExpanded: boolean;
  onToggleExpandCollapse: () => void;
}) {
  return (
    <div className="d-flex gap-2">
      <div className="btn-group btn-group-sm" role="group" aria-label="View type">
        <button
          type="button"
          className={`btn ${viewType === 'simple' ? 'btn-secondary' : 'btn-outline-secondary'}`}
          onClick={() => onViewTypeChange('simple')}
        >
          Simple
        </button>
        <button
          type="button"
          className={`btn ${viewType === 'detailed' ? 'btn-secondary' : 'btn-outline-secondary'}`}
          onClick={() => onViewTypeChange('detailed')}
        >
          Detailed
        </button>
      </div>
      <button
        className="btn btn-sm btn-outline-secondary"
        type="button"
        onClick={onToggleExpandCollapse}
      >
        {isAllExpanded ? (
          <>
            <i className="bi bi-chevron-contract" aria-hidden="true" /> Collapse all
          </>
        ) : (
          <>
            <i className="bi bi-chevron-expand" aria-hidden="true" /> Expand all
          </>
        )}
      </button>
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
  onCancel: () => void;
}) {
  if (!editMode) {
    if (!canEdit) return null;
    return (
      <button
        className="btn btn-sm btn-outline-secondary"
        type="button"
        onClick={() => setEditMode(true)}
      >
        <i className="bi bi-pencil" aria-hidden="true" /> Edit questions
      </button>
    );
  }

  const saveButton = (
    <button
      className="btn btn-sm btn-outline-secondary mx-1"
      type="submit"
      disabled={saveButtonDisabled}
    >
      <i className="bi bi-floppy" aria-hidden="true" /> Save and sync
    </button>
  );

  return (
    <form method="POST" className="d-flex gap-2 align-items-center">
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />
      {saveButtonDisabledReason ? (
        <span title={saveButtonDisabledReason} style={{ cursor: 'not-allowed' }}>
          {saveButton}
        </span>
      ) : (
        saveButton
      )}
      <button className="btn btn-sm btn-outline-secondary" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
