import { useMutation } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { Alert, Modal } from 'react-bootstrap';

export type ExtensionDeleteModalState = null | {
  extensionId: string;
  extensionName: string | null;
  userData: { uid: string; name: string | null; enrollment_id: string }[];
};

export function ExtensionDeleteModal({
  modalState,
  csrfToken,
  onHide,
  onSuccess,
}: {
  modalState: ExtensionDeleteModalState;
  csrfToken: string;
  onHide: () => void;
  onSuccess: () => void;
}) {
  const deleteMutation = useMutation({
    mutationFn: async (extensionId: string) => {
      const requestBody = {
        __csrf_token: csrfToken,
        __action: 'delete_extension',
        extension_id: extensionId,
      };
      const resp = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.message);
      }
    },
    onSuccess,
  });

  // To avoid a flash of empty content when the modal is closed, we'll snapshot
  // the state when it opens and clear it when it closes.
  const [snapshottedState, setSnapshottedState] = useState(modalState);

  const ModalBody = () => {
    if (!snapshottedState) return null;
    return (
      <>
        <p>
          Are you sure you want to delete{' '}
          {snapshottedState.extensionName === null
            ? 'this extension'
            : `the extension "${snapshottedState.extensionName}"`}
          ?
        </p>
        <details>
          <summary>Show affected students</summary>
          <table class="table table-bordered table-sm mb-0">
            <thead>
              <tr>
                <th>UID</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {snapshottedState.userData.map((user) => (
                <tr key={user.enrollment_id}>
                  <td>{user.uid}</td>
                  <td>{user.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </>
    );
  };

  return (
    <Modal
      backdrop="static"
      show={modalState !== null}
      onHide={onHide}
      onEntering={() => setSnapshottedState(modalState)}
      onExited={() => setSnapshottedState(null)}
    >
      <Modal.Header closeButton>
        <Modal.Title>Delete extension</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {deleteMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
            {deleteMutation.error.message}
          </Alert>
        )}
        <ModalBody />
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          class="btn btn-outline-secondary"
          disabled={deleteMutation.isPending}
          onClick={onHide}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-danger"
          disabled={deleteMutation.isPending}
          onClick={() => {
            if (!modalState) return;
            void deleteMutation.mutate(modalState.extensionId);
          }}
        >
          {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
