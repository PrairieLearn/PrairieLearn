import { useMutation } from '@tanstack/react-query';
import { Alert, Modal } from 'react-bootstrap';

export interface ExtensionDeleteModalData {
  extensionId: string;
  extensionName: string | null;
  userData: { uid: string; name: string | null; enrollment_id: string }[];
}

export function ExtensionDeleteModal({
  data,
  csrfToken,
  show,
  onHide,
  onExited,
  onSuccess,
}: {
  data: ExtensionDeleteModalData | null;
  csrfToken: string;
  show: boolean;
  onHide: () => void;
  onExited: () => void;
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

  return (
    <Modal backdrop="static" show={show} onHide={onHide} onExited={onExited}>
      <Modal.Header closeButton>
        <Modal.Title>Delete extension</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {deleteMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
            {deleteMutation.error.message}
          </Alert>
        )}
        {data && (
          <>
            <p>
              Are you sure you want to delete{' '}
              {data.extensionName === null
                ? 'this extension'
                : `the extension "${data.extensionName}"`}
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
                  {data.userData.map((user) => (
                    <tr key={user.enrollment_id}>
                      <td>{user.uid}</td>
                      <td>{user.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
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
            if (!data) return;
            void deleteMutation.mutate(data.extensionId);
          }}
        >
          {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
