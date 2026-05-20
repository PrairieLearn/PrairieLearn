import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import { getAppError } from '../../../lib/client/errors.js';
import type { AssessmentGroupsError } from '../../../trpc/assessment/assessment-groups.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

import { GroupWorkInstancesWarning } from './GroupWorkInstancesWarning.js';

function DisableGroupWorkModal({
  show,
  onHide,
  onConfirm,
  isPending,
  hasAssessmentInstances,
  courseInstanceId,
  assessmentId,
}: {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
  isPending: boolean;
  hasAssessmentInstances: boolean;
  courseInstanceId: string;
  assessmentId: string;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Disable group work</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          All groups, group assignments, and the group configuration for this assessment will be
          permanently removed.
        </p>
        <p className="mb-0 text-muted small">
          Students will need to be re-grouped if you enable group work again later.
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
  canDisable,
  disableUnavailableReason,
  onDisable,
}: {
  origHash: string | null;
  hasAssessmentInstances: boolean;
  courseInstanceId: string;
  assessmentId: string;
  canDisable: boolean;
  disableUnavailableReason?: string;
  onDisable: (result: { origHash: string }) => void;
}) {
  const [showDisableModal, setShowDisableModal] = useState(false);
  const trpc = useTRPC();
  const mutation = useMutation(trpc.assessmentGroups.disableGroupWork.mutationOptions());
  const appError = getAppError<AssessmentGroupsError['DisableGroupWork']>(mutation.error);

  return (
    <div className="card">
      <DisableGroupWorkModal
        show={showDisableModal}
        isPending={mutation.isPending}
        hasAssessmentInstances={hasAssessmentInstances}
        courseInstanceId={courseInstanceId}
        assessmentId={assessmentId}
        onHide={() => setShowDisableModal(false)}
        onConfirm={() =>
          mutation.mutate(
            { origHash },
            {
              onSuccess: (result) => {
                setShowDisableModal(false);
                onDisable(result);
              },
            },
          )
        }
      />
      <div className="card-body">
        <h5 className="mb-3">Manage group work</h5>
        {appError && (
          <Alert variant="danger" dismissible onClose={() => mutation.reset()}>
            {appError.message}
          </Alert>
        )}
        {!canDisable && disableUnavailableReason && (
          <Alert variant="info">{disableUnavailableReason}</Alert>
        )}
        <div className="d-flex align-items-center gap-3">
          <div className="flex-grow-1">
            <div className="fw-bold">Disable group work</div>
            <div className="text-muted small">
              All groups, group assignments, and the group configuration will be permanently
              removed.
            </div>
          </div>
          <Button
            variant="outline-danger"
            disabled={mutation.isPending || !canDisable}
            onClick={() => setShowDisableModal(true)}
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  );
}
