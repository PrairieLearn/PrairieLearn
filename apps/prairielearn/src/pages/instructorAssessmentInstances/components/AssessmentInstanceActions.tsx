import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Dropdown, Modal, Spinner } from 'react-bootstrap';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';
import { assertNever } from '@prairielearn/utils';

import { getAssessmentLogsUrl, getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import type { AssessmentInstancesError } from '../../../trpc/assessment/assessment-instances.js';
import { useTRPC } from '../../../trpc/assessment/context.js';
import type {
  AssessmentInstanceActionRow,
  AssessmentInstanceActionTarget,
} from '../instructorAssessmentInstances.types.js';

import { PendingRegradeQuestionList } from './PendingRegradeQuestionList.js';
import { TimeLimitModal } from './TimeLimitModal.js';
import { useInvalidateAssessmentInstancesList } from './useInvalidateAssessmentInstancesList.js';

type JobAction = 'grade' | 'gradeAndClose';
type OpenModal = JobAction | 'regrade' | 'delete' | 'timeLimit' | null;

function getTargetRows(target: AssessmentInstanceActionTarget): AssessmentInstanceActionRow[] {
  switch (target.kind) {
    case 'single':
      return [target.instance];
    case 'selected':
    case 'all':
      return target.instances;
    default:
      assertNever(target);
  }
}

function getTargetAssessmentInstanceIds(target: AssessmentInstanceActionTarget): string[] | null {
  switch (target.kind) {
    case 'single':
      return [target.instance.assessment_instance.id];
    case 'selected':
      return target.instances.map((instance) => instance.assessment_instance.id);
    case 'all':
      return null;
    default:
      assertNever(target);
  }
}

function describeTargetInstances(target: AssessmentInstanceActionTarget): string {
  switch (target.kind) {
    case 'single':
      return 'this instance';
    case 'selected':
      return `${target.instances.length} ${target.instances.length === 1 ? 'instance' : 'instances'}`;
    case 'all':
      return 'all instances';
    default:
      assertNever(target);
  }
}

function describeTargetAssessmentInstances(target: AssessmentInstanceActionTarget): string {
  switch (target.kind) {
    case 'single':
      return 'this assessment instance';
    case 'selected':
      return `${target.instances.length} assessment ${target.instances.length === 1 ? 'instance' : 'instances'}`;
    case 'all':
      return 'all assessment instances';
    default:
      assertNever(target);
  }
}

function describeTargetForTitle(target: AssessmentInstanceActionTarget): string {
  switch (target.kind) {
    case 'single':
      return 'this instance';
    case 'selected':
      return 'selected instances';
    case 'all':
      return 'all instances';
    default:
      assertNever(target);
  }
}

function describeNoRegradeQuestions(target: AssessmentInstanceActionTarget): string {
  switch (target.kind) {
    case 'single':
      return 'This instance has no questions awaiting full credit.';
    case 'selected':
      return 'None of the selected instances have questions awaiting full credit.';
    case 'all':
      return 'None of the instances have questions awaiting full credit.';
    default:
      assertNever(target);
  }
}

interface AssessmentInstanceActionsBaseProps {
  courseInstanceId: string;
  assessmentId: string;
  timezone: string;
  onActionSuccess: (result: { message: string; action: 'delete' | 'timeLimit' }) => void;
  showLogsLink?: boolean;
}

export type AssessmentInstanceActionsProps = AssessmentInstanceActionsBaseProps &
  (
    | { target: { kind: 'single'; instance: AssessmentInstanceActionRow }; clearSelection?: never }
    | {
        target:
          | { kind: 'selected'; instances: AssessmentInstanceActionRow[] }
          | { kind: 'all'; instances: AssessmentInstanceActionRow[] };
        clearSelection: () => void;
      }
  );

export function AssessmentInstanceActions(props: AssessmentInstanceActionsProps) {
  const {
    target,
    courseInstanceId,
    assessmentId,
    timezone,
    onActionSuccess,
    showLogsLink = true,
  } = props;
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const logsUrl = getAssessmentLogsUrl({ courseInstanceId, assessmentId });
  const isAllInstancesTarget = target.kind === 'all';
  const targetRows = getTargetRows(target);
  const clearSelection = target.kind === 'single' ? undefined : props.clearSelection;
  const count = targetRows.length;

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
          {showLogsLink && (
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
        target={target}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />
      <JobActionModalWithIds
        action="gradeAndClose"
        show={openModal === 'gradeAndClose'}
        target={target}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />

      <RegradeInstancesModal
        show={openModal === 'regrade'}
        target={target}
        courseInstanceId={courseInstanceId}
        onHide={() => setOpenModal(null)}
      />

      <DeleteInstancesModal
        show={openModal === 'delete'}
        target={target}
        onHide={() => setOpenModal(null)}
        onSuccess={() => {
          onActionSuccess({
            message: isAllInstancesTarget
              ? 'Deleted all instances.'
              : `Deleted ${count} ${count === 1 ? 'instance' : 'instances'}.`,
            action: 'delete',
          });
          clearSelection?.();
          setOpenModal(null);
        }}
      />

      <TimeLimitModal
        show={openModal === 'timeLimit'}
        target={target}
        timezone={timezone}
        onHide={() => setOpenModal(null)}
        onSuccess={() => {
          onActionSuccess({
            message: isAllInstancesTarget
              ? 'Updated the time limit for all instances.'
              : `Updated the time limit for ${count} ${count === 1 ? 'instance' : 'instances'}.`,
            action: 'timeLimit',
          });
          clearSelection?.();
          setOpenModal(null);
        }}
      />
    </>
  );
}

function JobActionModalWithIds({
  action,
  target,
  courseInstanceId,
  show,
  onHide,
}: {
  action: JobAction;
  target: AssessmentInstanceActionTarget;
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const assessmentInstanceIds = getTargetAssessmentInstanceIds(target);
  const mutationOptions = {
    grade: trpc.assessmentInstances.grade.mutationOptions(),
    gradeAndClose: trpc.assessmentInstances.gradeAndClose.mutationOptions(),
  }[action];
  const labels = {
    grade: {
      title: `Grade ${describeTargetForTitle(target)}`,
      body: 'grade pending submissions for',
      confirm: 'Grade',
    },
    gradeAndClose: {
      title: `Grade and close ${describeTargetForTitle(target)}`,
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
    <Modal show={show} onHide={onHide} onExited={() => mutation.reset()}>
      <Modal.Header closeButton>
        <Modal.Title>{labels.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to {labels.body} <strong>{describeTargetInstances(target)}</strong>?
          This cannot be undone.
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
  target,
  courseInstanceId,
  show,
  onHide,
}: {
  target: AssessmentInstanceActionTarget;
  courseInstanceId: string;
  show: boolean;
  onHide: () => void;
}) {
  const trpc = useTRPC();
  const assessmentInstanceIds = getTargetAssessmentInstanceIds(target);
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
    <Modal show={show} onHide={onHide} onExited={() => mutation.reset()}>
      <Modal.Header closeButton>
        <Modal.Title>{`Regrade ${describeTargetForTitle(target)}`}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Regrading recomputes the score for <strong>{describeTargetInstances(target)}</strong> and
          awards full credit for questions configured with <code>forceMaxPoints</code>. This updates
          stored scores without re-evaluating student submissions.
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
          <p className="text-muted mb-0">{describeNoRegradeQuestions(target)}</p>
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
  target,
  show,
  onHide,
  onSuccess,
}: {
  target: AssessmentInstanceActionTarget;
  show: boolean;
  onHide: () => void;
  onSuccess: () => void;
}) {
  const trpc = useTRPC();
  const assessmentInstanceIds = getTargetAssessmentInstanceIds(target);
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
    <Modal show={show} onHide={onHide} onExited={() => mutation.reset()}>
      <Modal.Header closeButton>
        <Modal.Title>{`Delete ${describeTargetForTitle(target)}`}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to delete{' '}
          <strong>{describeTargetAssessmentInstances(target)}</strong>? This cannot be undone.
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
          {mutation.isPending ? 'Deleting...' : `Delete ${describeTargetInstances(target)}`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
