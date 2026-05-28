import clsx from 'clsx';
import type { ReactNode } from 'react';
import Alert from 'react-bootstrap/Alert';

import { OverlayTrigger } from './OverlayTrigger.js';

export interface StickySaveBarAlert {
  variant: 'success' | 'danger';
  message: ReactNode;
  onDismiss?: () => void;
}

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
  /**
   * Optional alert rendered inside the sticky region, above the actions row.
   * Use this for save success/error feedback so it stays visible regardless
   * of the user's scroll position.
   */
  alert?: StickySaveBarAlert | null;
  /**
   * When true, the actions row spans the full width of the bar's container
   * (using `container-fluid`) instead of being capped at the Bootstrap
   * breakpoint max-widths. Use on full-width pages so the bar aligns with
   * edge-to-edge page content.
   */
  fullWidth?: boolean;
}

export function StickySaveBar({
  visible,
  isSaving,
  onCancel,
  formId,
  saveDisabledReason,
  alert,
  fullWidth,
}: StickySaveBarProps) {
  const isSaveDisabled = isSaving || Boolean(saveDisabledReason);

  const saveButton = (
    <button
      type="submit"
      form={formId}
      className={clsx(
        'btn btn-sm d-inline-flex align-items-center gap-1',
        isSaveDisabled ? 'btn-outline-secondary' : 'btn-primary',
      )}
      disabled={isSaveDisabled}
    >
      <i className="bi bi-floppy" aria-hidden="true" />
      {isSaving ? 'Saving...' : 'Save'}
    </button>
  );

  return (
    <div className="pl-ui-sticky-save-bar">
      {alert && (
        <Alert
          className="mb-0 rounded-0 border-start-0 border-end-0 border-bottom"
          variant={alert.variant}
          dismissible={Boolean(alert.onDismiss)}
          onClose={alert.onDismiss}
        >
          {alert.message}
        </Alert>
      )}
      <div
        className={clsx(
          fullWidth ? 'container-fluid' : 'container',
          'align-items-center justify-content-between gap-2 py-3',
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
