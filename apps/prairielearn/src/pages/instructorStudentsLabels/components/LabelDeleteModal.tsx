import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Modal } from 'react-bootstrap';

import { extractJobSequenceId } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';
import type { StudentLabelsTrpcClient } from '../utils/trpc-client.js';

export interface LabelDeleteModalData {
  labelId: string;
  labelName: string;
  userData: { uid: string; name: string | null }[];
}

export function LabelDeleteModal({
  data,
  trpcClient,
  courseInstanceId,
  origHash,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: LabelDeleteModalData | null;
  trpcClient: StudentLabelsTrpcClient;
  courseInstanceId: string;
  origHash: string | null;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
  onSuccess: (newOrigHash: string | null) => void;
}) {
  const deleteMutation = useMutation({
    mutationFn: async ({ labelId }: { labelId: string }) => {
      return await trpcClient.deleteLabel.mutate({
        labelId,
        origHash,
      });
    },
    onSuccess: (result) => onSuccess(result.origHash),
  });

  const jobSequenceId = extractJobSequenceId(deleteMutation.error);

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
        {deleteMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
            {deleteMutation.error.message}
            {jobSequenceId && (
              <>
                {' '}
                <a href={getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId)}>
                  View job logs
                </a>
              </>
            )}
          </Alert>
        )}
        <p>
          Are you sure you want to delete the label <strong>{data?.labelName}</strong>?
        </p>
        {(data?.userData.length ?? 0) > 0 && (
          <Alert variant="warning">
            This label has {data?.userData.length} student
            {data?.userData.length !== 1 ? 's' : ''}. They will be removed from this label.
            <details className="mt-2">
              <summary className="cursor-pointer">Show affected students</summary>
              <div className="mt-2 p-2 bg-light border rounded">
                {data?.userData.map((user) => (
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
          disabled={deleteMutation.isPending}
          onClick={() => data && deleteMutation.mutate({ labelId: data.labelId })}
        >
          {deleteMutation.isPending ? (
            <>
              <i className="fas fa-spinner fa-spin me-1" />
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
