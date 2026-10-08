import { Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { MAX_PRINT_COPIES } from '../../lib/client/print-packet.js';
import type { PrintableExamExportError } from '../../trpc/assessment/printable-exam-export.js';

export function BookletDownloadModal({
  show,
  students,
  formLabels,
  pending,
  error,
  onHide,
  onDownload,
}: {
  show: boolean;
  students: number;
  formLabels: string[];
  pending: boolean;
  error: unknown;
  onHide: () => void;
  onDownload: (students: number) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm({ defaultValues: { students }, mode: 'onChange' });

  return (
    <Modal
      show={show}
      backdrop="static"
      keyboard={!pending}
      aria-labelledby="print-booklet-title"
      onHide={onHide}
      onShow={() => reset({ students })}
      onEntered={() => setFocus('students')}
    >
      <Form noValidate onSubmit={handleSubmit(({ students }) => onDownload(students))}>
        <Modal.Header closeButton={!pending}>
          <Modal.Title as="h2" id="print-booklet-title" className="h5">
            Download booklet PDF
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppErrorAlert
            error={getAppError<PrintableExamExportError['pdf']>(error)}
            render={{ UNKNOWN: ({ message }) => message }}
          />
          <Form.Group controlId="print-booklet-students">
            <Form.Label>Number of students</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={MAX_PRINT_COPIES}
              step={1}
              defaultValue={students}
              disabled={pending}
              aria-describedby="print-booklet-students-help"
              aria-invalid={!!errors.students}
              aria-errormessage={errors.students ? 'print-booklet-students-error' : undefined}
              isInvalid={!!errors.students}
              {...register('students', {
                valueAsNumber: true,
                validate: (value) =>
                  (Number.isInteger(value) && value >= 1 && value <= MAX_PRINT_COPIES) ||
                  `Enter a whole number between 1 and ${MAX_PRINT_COPIES}.`,
              })}
            />
            <Form.Control.Feedback type="invalid" id="print-booklet-students-error">
              {errors.students?.message}
            </Form.Control.Feedback>
          </Form.Group>
          <p id="print-booklet-students-help" className="small text-muted mt-3 mb-0">
            {formLabels.length > 1
              ? `Forms ${formLabels.join(', ')} repeat in order, one complete copy per student.`
              : 'Each student receives a copy of the same form.'}{' '}
            Every copy includes your cover pages. One answer key for each form is appended at the
            end. Print single-sided.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="secondary" disabled={pending} onClick={onHide}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <span role="status">
                <Spinner size="sm" className="me-2" aria-hidden="true" />
                Generating…
              </span>
            ) : (
              <>
                <i className="bi bi-file-earmark-pdf me-2" aria-hidden="true" />
                Download booklet PDF
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
