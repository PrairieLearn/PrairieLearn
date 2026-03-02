import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { ViewType } from '../types.js';

export function EditModeToolbar({
  csrfToken,
  origHash,
  zones,
  editMode,
  canEdit,
  setEditMode,
  saveButtonDisabled,
  saveButtonDisabledReason,
  isAllExpanded,
  viewType,
  onViewTypeChange,
  onToggleExpandCollapse,
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
  isAllExpanded: boolean;
  viewType: ViewType;
  onViewTypeChange: (viewType: ViewType) => void;
  onToggleExpandCollapse: () => void;
  onCancel: () => void;
}) {
  if (!editMode) {
    return (
      <div className="d-flex gap-2">
        <div className="btn-group btn-group-sm" role="group" aria-label="View type">
          <button
            type="button"
            className={`btn ${viewType === 'simple' ? 'btn-light' : 'btn-outline-light'}`}
            onClick={() => onViewTypeChange('simple')}
          >
            Simple
          </button>
          <button
            type="button"
            className={`btn ${viewType === 'detailed' ? 'btn-light' : 'btn-outline-light'}`}
            onClick={() => onViewTypeChange('detailed')}
          >
            Detailed
          </button>
        </div>
        <button className="btn btn-sm btn-light" type="button" onClick={onToggleExpandCollapse}>
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
        {canEdit && (
          <button className="btn btn-sm btn-light" type="button" onClick={() => setEditMode(true)}>
            <i className="fa fa-edit" aria-hidden="true" /> Edit questions
          </button>
        )}
      </div>
    );
  }

  const saveButton = (
    <button className="btn btn-sm btn-light mx-1" type="submit" disabled={saveButtonDisabled}>
      <i className="fa fa-save" aria-hidden="true" /> Save and sync
    </button>
  );

  return (
    <form method="POST" className="d-flex gap-2 align-items-center">
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />
      <div className="btn-group btn-group-sm" role="group" aria-label="View type">
        <button
          type="button"
          className={`btn ${viewType === 'simple' ? 'btn-light' : 'btn-outline-light'}`}
          onClick={() => onViewTypeChange('simple')}
        >
          Simple
        </button>
        <button
          type="button"
          className={`btn ${viewType === 'detailed' ? 'btn-light' : 'btn-outline-light'}`}
          onClick={() => onViewTypeChange('detailed')}
        >
          Detailed
        </button>
      </div>
      <button className="btn btn-sm btn-light" type="button" onClick={onToggleExpandCollapse}>
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
      {saveButtonDisabledReason ? (
        <span title={saveButtonDisabledReason} style={{ cursor: 'not-allowed' }}>
          {saveButton}
        </span>
      ) : (
        saveButton
      )}
      <button className="btn btn-sm btn-light" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
