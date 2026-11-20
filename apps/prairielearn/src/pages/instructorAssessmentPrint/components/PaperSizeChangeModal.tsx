import { Button, Modal, Spinner } from 'react-bootstrap';

import type { PrintSettings } from '../../../lib/printing/print-settings.js';

export interface PendingPaperSizeChange {
  paperSize: PrintSettings['paperSize'];
  sourceFormId: string;
  expectedForms: { id: string; paperSize: PrintSettings['paperSize']; locked: boolean }[];
  versionedForms: { previousLabel: string; nextLabel: string }[];
}

/** Confirms a paper size change that creates new versions of downloaded forms. */
export function PaperSizeChangeModal({
  show,
  change,
  applying,
  onCancel,
  onApply,
  onExited,
}: {
  show: boolean;
  /** Stays set while the modal closes so its content doesn't change mid-animation. */
  change: PendingPaperSizeChange | null;
  applying: boolean;
  onCancel: () => void;
  onApply: (change: PendingPaperSizeChange) => void;
  onExited: () => void;
}) {
  return (
    <Modal
      show={show}
      aria-labelledby="print-paper-size-change-title"
      backdrop="static"
      keyboard={!applying}
      restoreFocus={false}
      onHide={onCancel}
      onExited={() => {
        onExited();
        window.document.getElementById('print-paper-size')?.focus();
      }}
    >
      <Modal.Header closeButton={!applying}>
        <Modal.Title as="h2" className="h5" id="print-paper-size-change-title">
          Change paper size for all forms
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          This will set all current forms to {change?.paperSize}. A download has started for these
          forms, so each will get a new numbered version:
        </p>
        <ul>
          {change?.versionedForms.map((form) => (
            <li key={form.previousLabel}>
              Form {form.previousLabel} → Form {form.nextLabel}
            </li>
          ))}
        </ul>
        <p className="mb-0">
          The previous versions will remain available in Previous forms. Question selections and
          other print settings will be kept.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="secondary" disabled={applying} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={applying}
          onClick={() => {
            if (change && !applying) onApply(change);
          }}
        >
          {applying ? (
            <>
              <Spinner size="sm" className="me-2" aria-hidden="true" />
              Updating forms…
            </>
          ) : (
            'Apply paper size'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
