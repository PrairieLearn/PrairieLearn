import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Dropdown, Modal, Spinner } from 'react-bootstrap';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';
import type { AssessmentInstanceRow } from '../../pages/instructorAssessmentInstances/instructorAssessmentInstances.types.js';
import type { AssessmentInstancesError } from '../../trpc/assessment/assessment-instances.js';
import { useTRPC } from '../../trpc/assessment/context.js';

import { PendingRegradeQuestionList } from './PendingRegradeQuestionList.js';
import { TimeLimitEditForm } from './TimeLimitEditForm.js';
import { useInvalidateAssessmentInstancesList } from './useInvalidateAssessmentInstancesList.js';

type JobAction = 'grade' | 'gradeAndClose';
type OpenModal = JobAction | 'regrade' | 'delete' | 'timeLimit' | null;

function describeTargetInstances(assessmentInstanceIds: string[] | null): string {
  if (assessmentInstanceIds == null) return 'all instances';
  const count = assessmentInstanceIds.length;
  return `${count} ${count === 1 ? 'instance' : 'instances'}`;
}

function describeTargetAssessmentInstances(assessmentInstanceIds: string[] | null): string {
  if (assessmentInstanceIds == null) return 'all assessment instances';
  const count = assessmentInstanceIds.length;
  return `${count} assessment ${count === 1 ? 'instance' : 'instances'}`;
}

type AssessmentInstanceActionTarget =
  | { type: 'single'; instance: AssessmentInstanceRow }
  | { type: 'selected' | 'all'; instances: AssessmentInstanceRow[] };

export function AssessmentInstanceActions({
  target,
  courseInstanceId,
  timezone,
  logsUrl,
  onDeleteSuccess,
  onTimeLimitSuccess,
}: {
  target: AssessmentInstanceActionTarget;
  courseInstanceId: string;
  timezone: string;
  logsUrl?: string;
  onDeleteSuccess: (message: string) => void;
  onTimeLimitSuccess: (message: string) => void;
}) {
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const isAllInstancesTarget = target.type === 'all';
  const targetRows = target.type === 'single' ? [target.instance] : target.instances;
  const assessmentInstanceIds = isAllInstancesTarget
    ? null
    : targetRows.map((row) => row.assessment_instance.id);
  const count = targetRows.length;
  const targetLabel =
    target.type === 'single'
      ? 'instance'
      : isAllInstancesTarget
        ? 'all instances'
        : 'selected instances';
  const targetDescription =
    target.type === 'single' ? 'this instance' : describeTargetInstances(assessmentInstanceIds);
  const singleRow = target.type === 'single' ? target.instance : undefined;

  const hasClosedInstance = targetRows.some((row) => !row.assessment_instance.open);
  const hasOpenInstance = targetRows.some((row) => row.assessment_instance.open);
  const hasTimeLimitInstance = targetRows.some(
    (row) => row.assessment_instance.open && row.time_remaining_sec != null,
  );

  return (
    <>
      <Dropdown>
        <Dropdown.Toggle size="sm" variant="light" id="instance-actions">
          <i className="bi bi-three-dots me-2" aria-hidden="true" />
          Actions
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
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => setOpenModal('timeLimit')}>
            <i className="bi bi-clock me-2" aria-hidden="true" />
            Change time limit
          </Dropdown.Item>
          <Dropdown.Item className="text-danger" onClick={() => setOpenModal('delete')}>
            <i className="bi bi-trash3 me-2" aria-hidden="true" />
            Delete
          </Dropdown.Item>
          {logsUrl && (
            <>
              <Dropdown.Divider />
              <Dropdown.Item as="a" href={logsUrl}>
                <i className="bi bi-card-list me-2" aria-hidden="true" />
                View logs
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Menu>
      </Dropdown>

      <JobActionModalWithIds
        action="grade"
        show={openModal === 'grade'}
        assessmentInstanceIds={assessmentInstanceIds}
        targetLabel={targetLabel}
        targetDescription={targetDescription}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />
      <JobActionModalWithIds
        action="gradeAndClose"
        show={openModal === 'gradeAndClose'}
        assessmentInstanceIds={assessmentInstanceIds}
        targetLabel={targetLabel}
        targetDescription={targetDescription}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />

      <RegradeInstancesModal
        show={openModal === 'regrade'}
        assessmentInstanceIds={assessmentInstanceIds}
        targetLabel={targetLabel}
        targetDescription={targetDescription}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />

      <DeleteInstancesModal
        show={openModal === 'delete'}
        assessmentInstanceIds={assessmentInstanceIds}
        targetLabel={targetLabel}
        onHide={() => setOpenModal(null)}
        onSuccess={() => {
          onDeleteSuccess(
            isAllInstancesTarget
              ? 'Deleted all instances.'
              : `Deleted ${count} ${count === 1 ? 'instance' : 'instances'}.`,
          );
          setOpenModal(null);
        }}
      />

      <Modal
        show={openModal === 'timeLimit'}
        aria-labelledby="instance-time-limit-title"
        onHide={() => setOpenModal(null)}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h4" id="instance-time-limit-title">
            {singleRow && !singleRow.assessment_instance.open
              ? 'Re-open instance'
              : 'Change time limit'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {openModal === 'timeLimit' && (
            <TimeLimitEditForm
              mode={singleRow ? 'single' : 'bulk'}
              singleRow={
                singleRow
                  ? {
                      open: singleRow.assessment_instance.open === true,
                      total_time: singleRow.total_time,
                      total_time_sec: singleRow.total_time_sec,
                      time_remaining: singleRow.time_remaining,
                      time_remaining_sec: singleRow.time_remaining_sec,
                      date: singleRow.assessment_instance.date?.toISOString() ?? '',
                    }
                  : undefined
              }
              assessmentInstanceIds={assessmentInstanceIds}
              targetDescription={
                isAllInstancesTarget
                  ? 'All instances'
                  : `${count} ${count === 1 ? 'instance' : 'instances'} selected`
              }
              hasOpenInstance={hasOpenInstance}
              hasClosedInstance={hasClosedInstance}
              hasTimeLimitInstance={hasTimeLimitInstance}
              timezone={timezone}
              onCancel={() => setOpenModal(null)}
              onSuccess={() => {
                onTimeLimitSuccess(
                  isAllInstancesTarget
                    ? 'Updated the time limit for all instances.'
                    : `Updated the time limit for ${count} ${count === 1 ? 'instance' : 'instances'}.`,
                );
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
  targetLabel,
  targetDescription,
  courseInstanceId,
  show,
  onHide,
}: {
  action: JobAction;
  assessmentInstanceIds: string[] | null;
  targetLabel: string;
  targetDescription: string;
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
      title: `Grade ${targetLabel}`,
      body: 'grade pending submissions for',
      confirm: 'Grade',
    },
    gradeAndClose: {
      title: `Grade and close ${targetLabel}`,
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

  return (
    <Modal
      show={show}
      aria-labelledby={`instance-${action}-title`}
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h4" id={`instance-${action}-title`}>
          {labels.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to {labels.body} <strong>{targetDescription}</strong>? This cannot
          be undone.
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
  targetLabel,
  targetDescription,
  courseInstanceId,
  show,
  onHide,
}: {
  assessmentInstanceIds: string[] | null;
  targetLabel: string;
  targetDescription: string;
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
  const questions = previewQuery.data ?? [];

  return (
    <Modal
      show={show}
      aria-labelledby="instance-regrade-title"
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title
          as="h2"
          className="h4"
          id="instance-regrade-title"
        >{`Regrade ${targetLabel}`}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Regrading recomputes the score for <strong>{targetDescription}</strong> and awards full
          credit for questions configured with <code>forceMaxPoints</code>. This updates stored
          scores without re-evaluating student submissions.
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
            {targetLabel === 'instance'
              ? 'This instance has no questions awaiting full credit.'
              : `None of the ${targetLabel === 'all instances' ? 'instances' : 'selected instances'} have questions awaiting full credit.`}
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
  targetLabel,
  show,
  onHide,
  onSuccess,
}: {
  assessmentInstanceIds: string[] | null;
  targetLabel: string;
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

  return (
    <Modal
      show={show}
      aria-labelledby="instance-delete-title"
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title
          as="h2"
          className="h4"
          id="instance-delete-title"
        >{`Delete ${targetLabel}`}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to delete{' '}
          <strong>
            {targetLabel === 'instance'
              ? 'this assessment instance'
              : describeTargetAssessmentInstances(assessmentInstanceIds)}
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
            : targetLabel === 'all instances'
              ? 'Delete all'
              : targetLabel === 'instance'
                ? 'Delete instance'
                : `Delete ${describeTargetInstances(assessmentInstanceIds)}`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
