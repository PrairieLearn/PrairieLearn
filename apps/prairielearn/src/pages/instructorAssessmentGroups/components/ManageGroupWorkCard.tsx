import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import { type AppError, AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import type { AssessmentGroupsError } from '../../../trpc/assessment/assessment-groups.js';
import { useTRPC } from '../../../trpc/assessment/context.js';
import type { ActionAccess } from '../types.js';

import { GroupWorkInstancesWarning } from './GroupWorkInstancesWarning.js';

function DisableGroupWorkModal({
  show,
  onHide,
  onConfirm,
  isPending,
  hasAssessmentInstances,
  courseInstanceId,
  assessmentId,
  error,
  onDismissError,
}: {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
  isPending: boolean;
  hasAssessmentInstances: boolean;
  courseInstanceId: string;
  assessmentId: string;
  error: AppError<AssessmentGroupsError['DisableGroupWork']> | null;
  onDismissError: () => void;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Disable group work</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AppErrorAlert
          error={error}
          className="mb-3"
          render={{
            SYNC_JOB_FAILED: ({ message, jobSequenceId }) => (
              <>
                {message}{' '}
                <a href={getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId)}>
                  View job logs
                </a>
              </>
            ),
            UNKNOWN: ({ message }) => message,
          }}
          onDismiss={onDismissError}
        />
        <p className="mb-2">
          All group configuration for this assessment, including groups and their memberships, will
          be permanently removed.
        </p>
        <p className="mb-0">
          If you enable group work again later, students will need to be assigned to groups again.
        </p>
        {hasAssessmentInstances && (
          <GroupWorkInstancesWarning
            action="disabling"
            courseInstanceId={courseInstanceId}
            assessmentId={assessmentId}
            className="mt-3 mb-0"
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={isPending} onClick={onHide}>
          Cancel
        </Button>
        <Button variant="danger" disabled={isPending || hasAssessmentInstances} onClick={onConfirm}>
          Disable group work
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function ManageGroupWorkCard({
  origHash,
  hasAssessmentInstances,
  courseInstanceId,
  assessmentId,
  disableAccess,
  assignmentSummary,
  onDisable,
}: {
  origHash: string | null;
  hasAssessmentInstances: boolean;
  courseInstanceId: string;
  assessmentId: string;
  disableAccess?: ActionAccess;
  assignmentSummary?: { totalStudentCount: number; unassignedStudentCount: number };
  onDisable: (result: { origHash: string }) => void;
}) {
  const [showDisableModal, setShowDisableModal] = useState(false);
  const canDisable = disableAccess?.status === 'allowed';
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.disableGroupWork.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['DisableGroupWork']>(mutation.error);
  const hideDisableModal = () => {
    mutation.reset();
    setShowDisableModal(false);
  };

  return (
    <div className="card">
      {disableAccess && (
        <DisableGroupWorkModal
          show={showDisableModal}
          isPending={mutation.isPending}
          hasAssessmentInstances={hasAssessmentInstances}
          courseInstanceId={courseInstanceId}
          assessmentId={assessmentId}
          error={appError}
          onDismissError={() => mutation.reset()}
          onHide={hideDisableModal}
          onConfirm={() =>
            mutation.mutate(
              { origHash },
              {
                onSuccess: (result) => {
                  hideDisableModal();
                  onDisable(result);
                },
              },
            )
          }
        />
      )}
      <div className="card-body py-2">
        {disableAccess?.status === 'denied' && (
          <Alert variant="info" className="mb-2">
            {disableAccess.reason}
          </Alert>
        )}
        <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-lg-between gap-2">
          <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-1 gap-sm-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-check-circle-fill text-success" aria-hidden="true" />
              <span className="fw-semibold">Group work is enabled</span>
            </div>
            {assignmentSummary && assignmentSummary.totalStudentCount > 0 && (
              <div className="text-muted small">
                {assignmentSummary.unassignedStudentCount === 0
                  ? 'All students assigned'
                  : `${assignmentSummary.unassignedStudentCount} student${assignmentSummary.unassignedStudentCount === 1 ? '' : 's'} unassigned`}
              </div>
            )}
          </div>
          {disableAccess && (
            <Button
              size="sm"
              variant="outline-danger"
              className="text-nowrap align-self-start align-self-lg-center"
              disabled={mutation.isPending || !canDisable}
              onClick={() => setShowDisableModal(true)}
            >
              Disable group work
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
