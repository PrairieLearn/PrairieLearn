import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Modal } from 'react-bootstrap';

import { getAppError } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import { useTRPC } from '../../../trpc/courseInstance/context.js';
import type { StudentLabelError } from '../../../trpc/courseInstance/student-labels.js';
import type { StudentLabelUserData } from '../instructorStudentsLabels.types.js';

export interface LabelDeleteModalData {
  labelId: string;
  labelName: string;
  userData: StudentLabelUserData[];
}

export function LabelDeleteModal({
  data,
  courseInstanceId,
  origHash,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: LabelDeleteModalData | null;
  courseInstanceId: string;
  origHash: string | null;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
  onSuccess: (newOrigHash: string | null) => void;
}) {
  const trpc = useTRPC();

  const deleteMutation = useMutation({
    ...trpc.studentLabels.destroy.mutationOptions(),
    onSuccess: (result) => onSuccess(result.origHash),
  });

  const appError = getAppError<StudentLabelError['Destroy']>(deleteMutation.error);

  function renderMutationError() {
    if (!appError) return null;

    switch (appError.code) {
      case 'SYNC_JOB_FAILED':
        return (
          <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
            {appError.message}{' '}
            <a href={getCourseInstanceJobSequenceUrl(courseInstanceId, appError.jobSequenceId)}>
              View job logs
            </a>
          </Alert>
        );
      case 'UNKNOWN':
        return (
          <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
            {appError.message}
          </Alert>
        );
    }
  }

  return (
    <Modal
      show={show}
      onHide={onHide}
      onExited={() => {
        deleteMutation.reset();
        onExited?.();
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Delete student label</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {renderMutationError()}
        <p>
          Are you sure you want to delete the label <strong>{data?.labelName}</strong>?
        </p>
        {data && data.userData.length > 0 && (
          <Alert variant="warning">
            This label has {data.userData.length} student
            {data.userData.length !== 1 ? 's' : ''}. This label will be removed from them.
            <details className="mt-2">
              <summary style={{ cursor: 'pointer' }}>Show affected students</summary>
              <div className="mt-2 p-2 bg-light border rounded">
                {data.userData.map((user) => (
                  <div key={user.uid}>{user.name || user.uid}</div>
                ))}
              </div>
            </details>
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={deleteMutation.isPending || !data}
          onClick={() => data && deleteMutation.mutate({ labelId: data.labelId, origHash })}
        >
          {deleteMutation.isPending ? (
            <>
              <span
                className="spinner-border spinner-border-sm me-1"
                role="status"
                aria-hidden="true"
              />
              Deleting...
            </>
          ) : (
            'Delete'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
