import clsx from 'clsx';

import { OverlayTrigger } from './OverlayTrigger.js';

export interface StickySaveBarProps {
  /** Whether the bar is visible. Typically driven by the form's dirty state. */
  visible: boolean;
  /** Whether a save is currently in flight. Disables both buttons. */
  isSaving: boolean;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
  /** Optional `id` of the form to submit. Use when the bar lives outside the form element. */
  formId?: string;
  /**
   * Optional reason the save button is disabled. When set, the save button is
   * disabled and a tooltip with this message is shown on hover/focus.
   */
  saveDisabledReason?: string | null;
}

export function StickySaveBar({
  visible,
  isSaving,
  onCancel,
  formId,
  saveDisabledReason,
}: StickySaveBarProps) {
  const isSaveDisabled = isSaving || Boolean(saveDisabledReason);

  const saveButton = (
    <button
      type="submit"
      form={formId}
      className={clsx('btn btn-sm', isSaveDisabled ? 'btn-outline-secondary' : 'btn-primary')}
      disabled={isSaveDisabled}
    >
      <i className="bi bi-floppy" aria-hidden="true" /> {isSaving ? 'Saving...' : 'Save and sync'}
    </button>
  );

  return (
    <div className="pl-ui-sticky-save-bar">
      <div
        className={clsx(
          'container align-items-center justify-content-between gap-2 py-3',
          visible ? 'd-flex' : 'd-none',
        )}
      >
        <div className="small text-muted">You have unsaved changes</div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={isSaving}
            onClick={onCancel}
          >
            Cancel
          </button>
          {saveDisabledReason ? (
            <OverlayTrigger
              tooltip={{
                props: { id: 'pl-ui-sticky-save-bar-tooltip' },
                body: saveDisabledReason,
              }}
            >
              <span className="d-inline-block">{saveButton}</span>
            </OverlayTrigger>
          ) : (
            saveButton
          )}
        </div>
      </div>
    </div>
  );
}
