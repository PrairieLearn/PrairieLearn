import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useState } from 'react';
import { Accordion, Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { assertNever } from '@prairielearn/utils';

import { useTRPC } from '../../trpc/course/context.js';
import type { CourseStaffError } from '../../trpc/course/course-staff.js';
import type { CourseRouter } from '../../trpc/course/trpc.js';

type PreviewRow = inferRouterOutputs<CourseRouter>['courseStaff']['preview']['rows'][number];
type ChangedRow = PreviewRow & { action: 'add' | 'update' | 'remove' };

function StaffChanges({ row }: { row: ChangedRow }) {
  const action = row.action;
  switch (action) {
    case 'remove':
      return <>Remove staff and all permissions</>;
    case 'add':
    case 'update':
      return (
        <ul className="mb-0 ps-3">
          {(row.action === 'add' || row.previousCourseRole !== row.courseRole) && (
            <li>
              Course: {row.previousCourseRole ?? 'None'} → {row.courseRole}
            </li>
          )}
          {row.courseInstanceChanges.map((change) => (
            <li key={change.courseInstanceId}>
              {change.shortName}: {change.previousRole} → {change.role}
            </li>
          ))}
        </ul>
      );
    default:
      return assertNever(action);
  }
}

export function StaffCsvImportModal({ onHide }: { onHide: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ file: FileList }>();
  const preview = useMutation(trpc.courseStaff.preview.mutationOptions());
  const sync = useMutation({
    ...trpc.courseStaff.sync.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(trpc.courseStaff.list.queryFilter()),
  });
  const pending = preview.isPending || sync.isPending;
  const changedRows =
    preview.data?.rows.filter((row): row is ChangedRow => row.action !== 'unchanged') ?? [];
  const uidByUserId = new Map(
    (preview.data?.rows ?? []).flatMap((row) =>
      row.expected ? [[row.expected.userId, row.uid] as const] : [],
    ),
  );
  const unchangedRows = preview.data?.rows.filter((row) => row.action === 'unchanged') ?? [];

  const submit = handleSubmit(async ({ file }) => {
    setFileError(null);
    preview.reset();
    sync.reset();
    let csv: string;
    try {
      csv = await file[0].text();
    } catch {
      setFileError('Unable to read this file. Select it again and retry.');
      return;
    }
    if (csv.trim().length === 0) {
      setFileError('The CSV file is empty. Select a file with a header and staff data.');
      return;
    }
    setText(csv);
    preview.mutate({ text: csv });
  });

  return (
    <Modal
      aria-labelledby="staff-csv-import-title"
      size="lg"
      backdrop={pending ? 'static' : true}
      show
      onHide={pending ? () => {} : onHide}
    >
      <Modal.Header closeButton={!pending}>
        <Modal.Title id="staff-csv-import-title">Import staff CSV</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {sync.isSuccess ? (
          <Alert variant="success" className="mb-0">
            Staff synchronized: {sync.data.add} added, {sync.data.update} updated,{' '}
            {sync.data.remove} removed, {sync.data.unchanged} unchanged.
          </Alert>
        ) : (
          <>
            {!preview.data && (
              <>
                <p>
                  Export the current CSV, edit it, and upload it here. Missing users and instance
                  columns are left unchanged. Use None to remove a permission. Leave every field
                  after a UID blank to remove that staff record entirely.
                </p>
                <Form id="staff-csv-import" onSubmit={submit}>
                  <Form.Group controlId="staff-csv-file">
                    <Form.Label>CSV file</Form.Label>
                    <Form.Control
                      type="file"
                      accept=".csv,text/csv"
                      disabled={pending}
                      aria-invalid={!!errors.file || !!fileError}
                      aria-errormessage={
                        errors.file || fileError ? 'staff-csv-file-error' : undefined
                      }
                      {...register('file', {
                        required: 'Select a CSV file.',
                        validate: (files) =>
                          files.length === 0
                            ? 'Select a CSV file.'
                            : files[0].size === 0
                              ? 'The CSV file is empty. Select a file with a header and staff data.'
                              : files[0].size <= 1024 * 1024 || 'CSV must be at most 1 MiB.',
                        onChange: () => {
                          preview.reset();
                          sync.reset();
                          setFileError(null);
                        },
                      })}
                    />
                    {(errors.file || fileError) && (
                      <Alert id="staff-csv-file-error" variant="danger" className="mt-2 mb-0">
                        {errors.file?.message ?? fileError}
                      </Alert>
                    )}
                  </Form.Group>
                </Form>
              </>
            )}
            <AppErrorAlert
              className="mt-2 mb-0"
              error={getAppError<CourseStaffError['Preview']>(preview.error)}
              render={{ UNKNOWN: ({ message }) => message }}
            />
            <AppErrorAlert
              className="mt-2 mb-0"
              error={getAppError<CourseStaffError['Sync']>(sync.error)}
              render={{ UNKNOWN: ({ message }) => message }}
            />
            {preview.data && (
              <div className="mt-3">
                <h2 className="h5">Preview</h2>
                <p>
                  {preview.data.summary.add} added, {preview.data.summary.update} updated,{' '}
                  {preview.data.summary.remove} removed, {preview.data.summary.unchanged} unchanged.
                </p>
                {preview.data.removalEnrollments.length > 0 && (
                  <Alert variant="warning">
                    Removing staff also deletes these enrollments:
                    <ul className="mb-0">
                      {preview.data.removalEnrollments.map((enrollment) => (
                        <li key={enrollment.enrollmentId}>
                          {uidByUserId.get(enrollment.userId!)}
                          {' — '}
                          {enrollment.shortName} ({enrollment.status})
                          {enrollment.instanceDeleted && ' — deleted instance'}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}
                <Accordion defaultActiveKey={['changed']} alwaysOpen>
                  <Accordion.Item eventKey="changed">
                    <Accordion.Header>Users with changes ({changedRows.length})</Accordion.Header>
                    <Accordion.Body>
                      {changedRows.length === 0 ? (
                        <p>No staff permissions will change.</p>
                      ) : (
                        <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                          <Table size="sm" responsive>
                            <thead>
                              <tr>
                                <th scope="col">UID</th>
                                <th scope="col">Action</th>
                                <th scope="col">Changes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changedRows.map((row) => (
                                <tr key={row.uid}>
                                  <td>{row.uid}</td>
                                  <td>
                                    {
                                      {
                                        add: 'Add',
                                        update: 'Update',
                                        remove: 'Remove',
                                      }[row.action]
                                    }
                                  </td>
                                  <td>
                                    <StaffChanges row={row} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </Accordion.Body>
                  </Accordion.Item>
                  {unchangedRows.length > 0 && (
                    <Accordion.Item eventKey="unchanged">
                      <Accordion.Header>
                        Users without changes ({unchangedRows.length})
                      </Accordion.Header>
                      <Accordion.Body>
                        <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                          <Table size="sm" className="mb-0" responsive>
                            <thead>
                              <tr>
                                <th scope="col">UID</th>
                              </tr>
                            </thead>
                            <tbody>
                              {unchangedRows.map((row) => (
                                <tr key={row.uid}>
                                  <td>{row.uid}</td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      </Accordion.Body>
                    </Accordion.Item>
                  )}
                </Accordion>
              </div>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={pending} onClick={onHide}>
          {sync.isSuccess ? 'Close' : 'Cancel'}
        </Button>
        {!sync.isSuccess && (
          <>
            {!preview.data ? (
              <Button type="submit" form="staff-csv-import" disabled={pending} variant="primary">
                {preview.isPending ? 'Generating preview…' : 'Preview changes'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  preview.reset();
                  sync.reset();
                  reset();
                  setText('');
                  setFileError(null);
                }}
              >
                Choose another file
              </Button>
            )}
            {preview.data && (
              <Button
                variant={preview.data.summary.remove > 0 ? 'danger' : 'primary'}
                disabled={pending || sync.isError}
                onClick={() =>
                  sync.mutate({ text, confirmationToken: preview.data.confirmationToken })
                }
              >
                {sync.isPending ? 'Synchronizing…' : 'Confirm sync'}
              </Button>
            )}
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
