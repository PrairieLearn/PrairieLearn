import clsx from 'clsx';

export interface StickySaveBarProps {
  /** Whether the form has unsaved changes. The bar collapses when false. */
  isDirty: boolean;
  /** Whether a save is currently in flight. Disables both buttons. */
  isSubmitting: boolean;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
  /** Optional `id` of the form to submit. Use when the bar lives outside the form element. */
  formId?: string;
}

export function StickySaveBar({ isDirty, isSubmitting, onCancel, formId }: StickySaveBarProps) {
  return (
    <div className="pl-ui-sticky-save-bar">
      <div
        className={clsx(
          'container align-items-center justify-content-between gap-2 py-3',
          isDirty ? 'd-flex' : 'd-none',
        )}
      >
        <div className="small text-muted">You have unsaved changes</div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            className="btn btn-sm btn-primary"
            disabled={isSubmitting}
          >
            <i className="bi bi-floppy" aria-hidden="true" />{' '}
            {isSubmitting ? 'Saving...' : 'Save and sync'}
          </button>
        </div>
      </div>
    </div>
  );
}
