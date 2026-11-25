import { Alert, Button, Modal, Spinner } from 'react-bootstrap';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import type { PrintDocument } from '../../../lib/printing/index.js';

export function CombinedPdfDownloadModal({
  show,
  document,
  formCount,
  enrolledStudents,
  pageCount,
  preparing,
  downloading,
  progress,
  failure,
  error,
  onHide,
  onExited,
  onReviewForm,
  onDownload,
}: {
  show: boolean;
  document: PrintDocument;
  formCount: number;
  enrolledStudents: number;
  pageCount: number | null;
  preparing: boolean;
  downloading: boolean;
  progress: { completed: number; total: number } | null;
  failure: { message: string; printFormId?: string; formLabel?: string } | null;
  error: unknown;
  onHide: () => void;
  onExited: () => void;
  onReviewForm: (id: string) => void;
  onDownload: () => void;
}) {
  const title =
    document === 'assessment' ? 'Download all forms PDF' : 'Download all answer keys PDF';
  const item = document === 'assessment' ? 'form' : 'answer key';
  const failedFormId = failure?.printFormId;
  const failedFormLabel = failure?.formLabel;

  return (
    <Modal
      show={show}
      backdrop={downloading ? 'static' : true}
      keyboard={!downloading}
      aria-labelledby="print-combined-download-title"
      restoreFocus={false}
      onHide={onHide}
      onExited={onExited}
    >
      <Modal.Header closeButton={!downloading}>
        <Modal.Title as="h2" id="print-combined-download-title" className="h5">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AppErrorAlert
          error={getAppError<never>(error)}
          render={{ UNKNOWN: ({ message }) => message }}
        />
        {failure && (
          <Alert variant="danger" role="alert" className="mb-3">
            {failure.message}
            {failedFormId && failedFormLabel && (
              <Button
                type="button"
                variant="link"
                className="p-0 ms-1"
                onClick={() => onReviewForm(failedFormId)}
              >
                Review Form {failedFormLabel}
              </Button>
            )}
          </Alert>
        )}
        {preparing && (
          <p role="status" className="mb-0">
            <Spinner size="sm" className="me-2" aria-hidden="true" />
            {progress && progress.completed > 0
              ? `Checking documents ${progress.completed} of ${progress.total}…`
              : document === 'assessment'
                ? 'Preparing assessment…'
                : 'Preparing answer keys…'}
          </p>
        )}
        {pageCount !== null && (
          <>
            <p>
              Each included {item} consists of {pageCount} {pageCount === 1 ? 'page' : 'pages'}.
            </p>
            {document === 'assessment' && enrolledStudents > 0 && (
              <p>
                Print at least {Math.ceil(enrolledStudents / formCount)} copies of each form to
                provide for {enrolledStudents} students.
              </p>
            )}
            <p className="small text-muted mb-0">
              Click below to export your {document === 'assessment' ? 'forms' : 'answer keys'} as
              one PDF file. It will begin downloading once it's ready, and will remain in 'Recent
              exports' for up to 24 hours after you request it.
            </p>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="secondary" disabled={downloading} onClick={onHide}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={preparing || downloading || pageCount === null}
          onClick={onDownload}
        >
          {downloading ? (
            <span role="status">
              <Spinner size="sm" className="me-2" aria-hidden="true" />
              Starting download…
            </span>
          ) : (
            <>
              <i className="bi bi-file-earmark-pdf me-2" aria-hidden="true" />
              {title}
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
