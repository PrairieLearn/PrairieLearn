import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Dropdown, Modal, Spinner } from 'react-bootstrap';

import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import type { AssessmentInstancesError } from '../../../trpc/assessment/assessment-instances.js';
import { useTRPC } from '../../../trpc/assessment/context.js';
import type { AssessmentInstanceRow } from '../instructorAssessmentInstances.types.js';

import { PendingRegradeQuestionList } from './PendingRegradeQuestionList.js';
import { TimeLimitEditForm } from './TimeLimitEditForm.js';
import { useInvalidateAssessmentInstancesList } from './useInvalidateAssessmentInstancesList.js';

type JobAction = 'grade' | 'gradeAndClose';
type OpenModal = JobAction | 'regrade' | 'delete' | 'timeLimit' | null;

export function InstanceSelectionToolbar({
  selectedRows,
  clearSelection,
  courseInstanceId,
  timezone,
  onActionSuccess,
}: {
  selectedRows: AssessmentInstanceRow[];
  clearSelection: () => void;
  courseInstanceId: string;
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
        <Dropdown>
          <Dropdown.Toggle size="sm" variant="light" id="grade-actions">
            <i className="bi bi-clipboard-check me-2" aria-hidden="true" />
            Grade
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item onClick={() => setOpenModal('grade')}>
              <i className="bi bi-clipboard-check me-2" aria-hidden="true" />
              Grade
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setOpenModal('gradeAndClose')}>
              <i className="bi bi-slash-circle me-2" aria-hidden="true" />
              Grade &amp; close
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setOpenModal('regrade')}>
              <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
              Regrade
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
        <Button size="sm" variant="light" onClick={() => setOpenModal('timeLimit')}>
          <i className="bi bi-clock me-2" aria-hidden="true" />
          Change time limit
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

      <JobActionModalWithIds
        action="grade"
        show={openModal === 'grade'}
        assessmentInstanceIds={assessmentInstanceIds}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />
      <JobActionModalWithIds
        action="gradeAndClose"
        show={openModal === 'gradeAndClose'}
        assessmentInstanceIds={assessmentInstanceIds}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />

      <RegradeInstancesModal
        show={openModal === 'regrade'}
        assessmentInstanceIds={assessmentInstanceIds}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />

      <DeleteInstancesModal
        show={openModal === 'delete'}
        assessmentInstanceIds={assessmentInstanceIds}
        onHide={() => setOpenModal(null)}
        onSuccess={() => {
          onActionSuccess(`Deleted ${count} ${count === 1 ? 'instance' : 'instances'}.`);
          clearSelection();
          setOpenModal(null);
        }}
      />

      <Modal show={openModal === 'timeLimit'} onHide={() => setOpenModal(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Change time limit</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {openModal === 'timeLimit' && (
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
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}

function JobActionModalWithIds({
  action,
  assessmentInstanceIds,
  courseInstanceId,
  show,
  onHide,
}: {
  action: JobAction;
  assessmentInstanceIds: string[];
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const mutationOptions = {
    grade: trpc.assessmentInstances.grade.mutationOptions(),
    gradeAndClose: trpc.assessmentInstances.gradeAndClose.mutationOptions(),
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
  }[action];

  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: ({ jobSequenceId }) => {
      window.location.assign(getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId));
    },
  });
  const appError = getAppError<AssessmentInstancesError[JobAction]>(mutation.error);
  const count = assessmentInstanceIds.length;

  return (
    <Modal show={show} onHide={onHide} onExited={() => mutation.reset()}>
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
        <AppErrorAlert
          error={appError}
          render={{ UNKNOWN: ({ message }) => message }}
          onDismiss={() => mutation.reset()}
        />
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

function RegradeInstancesModal({
  assessmentInstanceIds,
  courseInstanceId,
  show,
  onHide,
}: {
  assessmentInstanceIds: string[];
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const previewQuery = useQuery({
    ...trpc.assessmentInstances.regradePreview.queryOptions({ assessmentInstanceIds }),
    enabled: show,
  });
  const mutation = useMutation({
    ...trpc.assessmentInstances.regrade.mutationOptions(),
    onSuccess: ({ jobSequenceId }) => {
      window.location.assign(getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId));
    },
  });
  const appError = getAppError<AssessmentInstancesError['regrade']>(mutation.error);
  const count = assessmentInstanceIds.length;
  const questions = previewQuery.data ?? [];

  return (
    <Modal show={show} onHide={onHide} onExited={() => mutation.reset()}>
      <Modal.Header closeButton>
        <Modal.Title>Regrade selected instances</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Regrading recomputes the score for{' '}
          <strong>
            {count} {count === 1 ? 'instance' : 'instances'}
          </strong>{' '}
          and awards full credit for questions configured with <code>forceMaxPoints</code>. Student
          submissions are not re-graded.
        </p>
        {previewQuery.isPending ? (
          <div className="d-flex align-items-center gap-2 text-muted">
            <Spinner animation="border" size="sm" /> Checking which questions will change…
          </div>
        ) : previewQuery.isError ? (
          <p className="text-muted mb-0">Couldn't load the list of affected questions.</p>
        ) : questions.length > 0 ? (
          <PendingRegradeQuestionList questions={questions} />
        ) : (
          <p className="text-muted mb-0">
            None of the selected instances have questions awaiting full credit.
          </p>
        )}
        <p className="mt-3 mb-0">This cannot be undone.</p>
        <AppErrorAlert
          error={appError}
          className="mt-3 mb-0"
          render={{ UNKNOWN: ({ message }) => message }}
          onDismiss={() => mutation.reset()}
        />
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
          {mutation.isPending ? 'Working...' : 'Regrade'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function DeleteInstancesModal({
  assessmentInstanceIds,
  show,
  onHide,
  onSuccess,
}: {
  assessmentInstanceIds: string[];
  show: boolean;
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
  const appError = getAppError<AssessmentInstancesError['delete']>(mutation.error);
  const count = assessmentInstanceIds.length;

  return (
    <Modal show={show} onHide={onHide} onExited={() => mutation.reset()}>
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
        <AppErrorAlert
          error={appError}
          render={{ UNKNOWN: ({ message }) => message }}
          onDismiss={() => mutation.reset()}
        />
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
