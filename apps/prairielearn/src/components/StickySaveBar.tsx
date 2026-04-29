import clsx from 'clsx';
import { Alert } from 'react-bootstrap';

export function StickySaveBar({
  isDirty,
  isSubmitting,
  successMessage,
  errorMessage,
  onDismissSuccess,
  onDismissError,
  onCancel,
  formId,
  saveLabel = 'Save',
  savingLabel = 'Saving...',
  unsavedChangesMessage = 'You have unsaved changes',
}: {
  isDirty: boolean;
  isSubmitting: boolean;
  successMessage?: string | null;
  errorMessage?: string | null;
  onDismissSuccess?: () => void;
  onDismissError?: () => void;
  onCancel: () => void;
  formId?: string;
  saveLabel?: string;
  savingLabel?: string;
  unsavedChangesMessage?: string;
}) {
  return (
    <div className="position-sticky bottom-0 z-3 bg-body border-top">
      {successMessage && (
        <Alert
          className="mb-0 rounded-0 border-start-0 border-end-0 border-bottom"
          variant="success"
          dismissible
          onClose={onDismissSuccess}
        >
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert
          className="mb-0 rounded-0 border-start-0 border-end-0 border-bottom"
          variant="danger"
          dismissible
          onClose={onDismissError}
        >
          {errorMessage}
        </Alert>
      )}
      <div
        className={clsx(
          'container align-items-center justify-content-between gap-2 py-3',
          isDirty ? 'd-flex' : 'd-none',
        )}
      >
        <div className="small text-muted">{unsavedChangesMessage}</div>
        <div className="d-flex gap-2">
          <button
            id="cancel-button"
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            id="save-button"
            type="submit"
            form={formId}
            className="btn btn-sm btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? savingLabel : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

StickySaveBar.displayName = 'StickySaveBar';
