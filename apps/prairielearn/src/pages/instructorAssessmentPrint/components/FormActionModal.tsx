import { Button, Modal, Spinner } from 'react-bootstrap';

export type PendingFormAction =
  | { action: 'regenerate' | 'archive'; id: string; label: string }
  | {
      action: 'reviseSelection';
      id: string;
      label: string;
      questionNumber: string;
      included: boolean;
    };

/** Confirms regenerating, archiving, or creating a new version of a form. */
export function FormActionModal({
  show,
  action,
  pending,
  regenerateLocked,
  hasRandomization,
  nextLabel,
  onCancel,
  onConfirm,
  onExited,
}: {
  show: boolean;
  /** Stays set while the modal closes so its content doesn't change mid-animation. */
  action: PendingFormAction | null;
  pending: boolean;
  /** Regenerating a downloaded form creates its next version instead of rerandomizing it. */
  regenerateLocked: boolean;
  hasRandomization: boolean;
  /** The label a replacement version would get. */
  nextLabel: string | null;
  onCancel: () => void;
  onConfirm: (action: PendingFormAction) => void;
  onExited: () => void;
}) {
  return (
    <Modal
      show={show}
      aria-labelledby="print-form-action-title"
      backdrop="static"
      keyboard={!pending}
      enforceFocus={show}
      restoreFocus={false}
      onHide={onCancel}
      onExited={onExited}
    >
      <Modal.Header closeButton={!pending}>
        <Modal.Title as="h2" className="h5" id="print-form-action-title">
          {action?.action === 'reviseSelection'
            ? `Change Form ${action.label} questions`
            : `${action?.action === 'regenerate' ? 'Regenerate' : 'Archive'} Form ${action?.label}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {action?.action === 'regenerate' ? (
          regenerateLocked ? (
            <p className="mb-0">
              This will replace <strong>Form {action.label}</strong> with{' '}
              <strong>Form {nextLabel}</strong>
              {hasRandomization ? ' applying fresh randomization' : ''}.{' '}
              <strong>Form {action.label}</strong> will remain available for reference in the
              'Previous forms' section with its chosen questions and settings.
            </p>
          ) : (
            <p className="mb-0">
              This will regenerate <strong>Form {action.label}</strong> while keeping its label,
              selected questions, their order, and print settings.
              {hasRandomization ? ' Random question values may change.' : ''}
            </p>
          )
        ) : action?.action === 'reviseSelection' ? (
          <p className="mb-0">
            A download has started for this form. {action.included ? 'Including' : 'Deselecting'}{' '}
            question {action.questionNumber} will replace <strong>Form {action.label}</strong> with{' '}
            <strong>Form {nextLabel}</strong>. The new version keeps the question order, random
            values, other selections, and print settings. The original remains in Previous forms.
          </p>
        ) : (
          <p className="mb-0">
            This will remove Form {action?.label} from the current set. You can still preview or
            download it under Previous forms, but later edits to the assessment or its questions may
            affect a new download.
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={action?.action === 'archive' ? 'danger' : 'primary'}
          className={pending ? 'disabled' : undefined}
          aria-disabled={pending}
          onClick={() => {
            if (action && !pending) onConfirm(action);
          }}
        >
          {pending ? (
            <>
              <Spinner size="sm" className="me-2" aria-hidden="true" />
              {action?.action === 'regenerate'
                ? 'Regenerating…'
                : action?.action === 'reviseSelection'
                  ? 'Creating version…'
                  : 'Archiving…'}
            </>
          ) : action?.action === 'regenerate' ? (
            'Regenerate form'
          ) : action?.action === 'reviseSelection' ? (
            'Create new form version'
          ) : (
            'Archive form'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
