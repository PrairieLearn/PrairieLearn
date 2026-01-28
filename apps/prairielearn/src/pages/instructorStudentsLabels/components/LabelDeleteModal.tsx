import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Modal } from 'react-bootstrap';

import { JobSequenceError } from '../../../lib/client/errors.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';

export interface LabelDeleteModalData {
  labelId: string;
  labelName: string;
  userData: { uid: string; name: string | null }[];
}

export function LabelDeleteModal({
  data,
  csrfToken,
  courseInstanceId,
  origHash,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: LabelDeleteModalData | null;
  csrfToken: string;
  courseInstanceId: string;
  origHash: string | null;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
  onSuccess: () => void;
}) {
  const deleteMutation = useMutation({
    mutationFn: async ({ labelId, labelName }: { labelId: string; labelName: string }) => {
      const body = new URLSearchParams({
        __action: 'delete_label',
        __csrf_token: csrfToken,
        label_id: labelId,
        label_name: labelName,
        orig_hash: origHash ?? '',
      });
      const res = await fetch(window.location.href.split('?')[0], {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new JobSequenceError(json.error ?? 'Failed to delete label', json.jobSequenceId);
      }
      return res.json();
    },
    onSuccess,
  });

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
            {deleteMutation.error instanceof JobSequenceError &&
              deleteMutation.error.jobSequenceId && (
                <>
                  {' '}
                  <a
                    href={getCourseInstanceJobSequenceUrl(
                      courseInstanceId,
                      deleteMutation.error.jobSequenceId,
                    )}
                  >
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
          onClick={() =>
            data && deleteMutation.mutate({ labelId: data.labelId, labelName: data.labelName })
          }
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
