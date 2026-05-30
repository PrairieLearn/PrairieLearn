import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import { getAppError } from '../../../lib/client/errors.js';
import { useTRPC } from '../../../trpc/assessment/context.js';
import type { AssessmentInstanceRow } from '../instructorAssessmentInstances.types.js';

import { TimeLimitEditForm } from './TimeLimitEditForm.js';
import { useInvalidateAssessmentInstancesList } from './useInvalidateAssessmentInstancesList.js';

type JobAction = 'grade' | 'gradeAndClose' | 'regrade';
type OpenModal = JobAction | 'delete' | 'timeLimit' | null;

export function InstanceSelectionToolbar({
  selectedRows,
  clearSelection,
  urlPrefix,
  timezone,
  onActionSuccess,
}: {
  selectedRows: AssessmentInstanceRow[];
  clearSelection: () => void;
  urlPrefix: string;
  timezone: string;
  onActionSuccess: (message: string) => void;
}) {
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const assessmentInstanceIds = selectedRows.map((row) => row.assessment_instance.id);
  const count = assessmentInstanceIds.length;

  const hasClosedInstance = selectedRows.some((row) => !row.assessment_instance.open);
  const hasOpenInstance = selectedRows.some(
    (row) => row.assessment_instance.open && row.time_remaining_sec == null,
  );
  const hasTimeLimitInstance = selectedRows.some(
    (row) => row.assessment_instance.open && row.time_remaining_sec != null,
  );

  return (
    <>
      <div className="d-flex align-items-center gap-2">
        <Button size="sm" variant="light" onClick={() => setOpenModal('grade')}>
          <i className="bi bi-clipboard-check me-2" aria-hidden="true" />
          Grade
        </Button>
        <Button size="sm" variant="light" onClick={() => setOpenModal('gradeAndClose')}>
          <i className="bi bi-slash-circle me-2" aria-hidden="true" />
          Grade &amp; close
        </Button>
        <Button size="sm" variant="light" onClick={() => setOpenModal('timeLimit')}>
          <i className="bi bi-clock me-2" aria-hidden="true" />
          Change time limit
        </Button>
        <Button size="sm" variant="light" onClick={() => setOpenModal('regrade')}>
          <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
          Regrade
        </Button>
        <Button
          size="sm"
          variant="light"
          className="text-danger"
          onClick={() => setOpenModal('delete')}
        >
          <i className="bi bi-trash3 me-2" aria-hidden="true" />
          Delete
        </Button>
      </div>

      {(openModal === 'grade' || openModal === 'gradeAndClose' || openModal === 'regrade') && (
        <JobActionModalWithIds
          action={openModal}
          assessmentInstanceIds={assessmentInstanceIds}
          urlPrefix={urlPrefix}
          onHide={() => setOpenModal(null)}
        />
      )}

      {openModal === 'delete' && (
        <DeleteInstancesModal
          assessmentInstanceIds={assessmentInstanceIds}
          onHide={() => setOpenModal(null)}
          onSuccess={() => {
            onActionSuccess(`Deleted ${count} ${count === 1 ? 'instance' : 'instances'}.`);
            clearSelection();
            setOpenModal(null);
          }}
        />
      )}

      {openModal === 'timeLimit' && (
        <Modal show onHide={() => setOpenModal(null)}>
          <Modal.Header closeButton>
            <Modal.Title>Change time limit</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <TimeLimitEditForm
              mode="bulk"
              assessmentInstanceIds={assessmentInstanceIds}
              hasOpenInstance={hasOpenInstance}
              hasClosedInstance={hasClosedInstance}
              hasTimeLimitInstance={hasTimeLimitInstance}
              timezone={timezone}
              onCancel={() => setOpenModal(null)}
              onSuccess={() => {
                onActionSuccess(
                  `Updated the time limit for ${count} ${count === 1 ? 'instance' : 'instances'}.`,
                );
                clearSelection();
                setOpenModal(null);
              }}
            />
          </Modal.Body>
        </Modal>
      )}
    </>
  );
}

function JobActionModalWithIds({
  action,
  assessmentInstanceIds,
  urlPrefix,
  onHide,
}: {
  action: JobAction;
  assessmentInstanceIds: string[];
  urlPrefix: string;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const mutationOptions = {
    grade: trpc.assessmentInstances.grade.mutationOptions(),
    gradeAndClose: trpc.assessmentInstances.gradeAndClose.mutationOptions(),
    regrade: trpc.assessmentInstances.regrade.mutationOptions(),
  }[action];
  const labels = {
    grade: {
      title: 'Grade selected instances',
      body: 'grade pending submissions for',
      confirm: 'Grade',
    },
    gradeAndClose: {
      title: 'Grade and close selected instances',
      body: 'grade and close',
      confirm: 'Grade and close',
    },
    regrade: { title: 'Regrade selected instances', body: 'regrade', confirm: 'Regrade' },
  }[action];

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: ({ jobSequenceId }) => {
      window.location.assign(`${urlPrefix}/jobSequence/${jobSequenceId}`);
    },
  });
  const appError = getAppError<never>(mutation.error);
  const count = assessmentInstanceIds.length;

  return (
    <Modal show onHide={onHide} onExited={() => mutation.reset()}>
      <Modal.Header closeButton>
        <Modal.Title>{labels.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to {labels.body}{' '}
          <strong>
            {count} {count === 1 ? 'instance' : 'instances'}
          </strong>
          ? This cannot be undone.
        </p>
        {appError ? <Alert variant="danger">{appError.message}</Alert> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ assessmentInstanceIds })}
        >
          {mutation.isPending ? 'Working...' : labels.confirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function DeleteInstancesModal({
  assessmentInstanceIds,
  onHide,
  onSuccess,
}: {
  assessmentInstanceIds: string[];
  onHide: () => void;
  onSuccess: () => void;
}) {
  const trpc = useTRPC();
  const invalidateList = useInvalidateAssessmentInstancesList();
  const mutation = useMutation({
    ...trpc.assessmentInstances.delete.mutationOptions(),
    onSuccess: async () => {
      await invalidateList();
      onSuccess();
    },
  });
  const appError = getAppError<never>(mutation.error);
  const count = assessmentInstanceIds.length;

  return (
    <Modal show onHide={onHide} onExited={() => mutation.reset()}>
      <Modal.Header closeButton>
        <Modal.Title>Delete selected instances</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to delete{' '}
          <strong>
            {count} assessment {count === 1 ? 'instance' : 'instances'}
          </strong>
          ? This cannot be undone.
        </p>
        {appError ? <Alert variant="danger">{appError.message}</Alert> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ assessmentInstanceIds })}
        >
          {mutation.isPending
            ? 'Deleting...'
            : `Delete ${count} ${count === 1 ? 'instance' : 'instances'}`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
