import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import { getAppError } from '../../../lib/client/errors.js';
import { type GroupSettingsFormValues } from '../../../lib/group-config.js';
import type { AssessmentGroupsError } from '../../../trpc/assessment/assessment-groups.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

import { GroupWorkInstancesWarning } from './GroupWorkInstancesWarning.js';

function DisableGroupWorkModal({
  show,
  onHide,
  onConfirm,
  isPending,
  hasAssessmentInstances,
  assessmentStudentsUrl,
}: {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
  isPending: boolean;
  hasAssessmentInstances: boolean;
  assessmentStudentsUrl: string;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Disable group work</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          Students will no longer be able to access this assessment as a group, and existing groups
          will be unable to submit until group work is re-enabled.
        </p>
        <p className="mb-0 text-muted small">
          The current group configuration will be preserved and restored if you re-enable group work
          later.
        </p>
        {hasAssessmentInstances && (
          <GroupWorkInstancesWarning
            action="disabling"
            assessmentStudentsUrl={assessmentStudentsUrl}
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
  assessmentStudentsUrl,
  onDisable,
}: {
  origHash: string | null;
  hasAssessmentInstances: boolean;
  assessmentStudentsUrl: string;
  onDisable: (result: {
    origHash: string;
    groupSettingsDefaults: GroupSettingsFormValues | null;
  }) => void;
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
        assessmentStudentsUrl={assessmentStudentsUrl}
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
        <div className="d-flex align-items-center gap-3">
          <div className="flex-grow-1">
            <div className="fw-bold">Disable group work</div>
            <div className="text-muted small">
              The current configuration will be preserved and can be restored later.
            </div>
          </div>
          <Button
            variant="outline-danger"
            disabled={mutation.isPending}
            onClick={() => setShowDisableModal(true)}
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  );
}
