import { useMutation } from '@tanstack/react-query';
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
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error('Failed to delete extension');
    },
    onSuccess,
  });
  return (
    <Modal backdrop="static" show={modalState !== null} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Delete Extension</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {modalState!.userData.length > 0 ? (
          <>
            Are you sure you want to delete{' '}
            {modalState!.extensionName === null
              ? 'this extension'
              : `the extension "${modalState!.extensionName}"`}{' '}
            with students: "{modalState!.userData.map((user) => user.uid).join(', ')}"?
          </>
        ) : (
          <>
            Are you sure you want to delete{' '}
            {modalState!.extensionName === null
              ? 'this extension'
              : `the extension "${modalState!.extensionName}"`}
            ?
          </>
        )}
        {deleteMutation.isError && (
          <Alert variant="danger" dismissible onClose={() => deleteMutation.reset()}>
            {deleteMutation.error.message}
          </Alert>
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
