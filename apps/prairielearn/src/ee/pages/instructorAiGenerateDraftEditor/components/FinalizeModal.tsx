import { Modal } from 'react-bootstrap';

export function FinalizeModal({
  csrfToken,
  show,
  onHide,
}: {
  csrfToken: string;
  show: boolean;
  onHide: () => void;
}) {
  return (
    <Modal show={show} size="lg" backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Finalize question</Modal.Title>
      </Modal.Header>
      <form method="POST" autocomplete="off">
        <Modal.Body>
          <div class="alert alert-primary" role="alert">
            After finalizing the question, you will be able to use it on assessments and make manual
            edits.
          </div>
          <div class="mb-3">
            <label for="question-title" class="form-label">
              Title
            </label>
            <input type="text" class="form-control" id="question-title" name="title" required />
            <div class="form-text text-muted">
              The title of the question as it will appear in the question bank, e.g. "Add two random
              numbers".
            </div>
          </div>
          <div class="mb-3">
            <label for="question-qid" class="form-label">
              QID
            </label>
            <input
              type="text"
              class="form-control"
              id="question-qid"
              name="qid"
              pattern="[\-A-Za-z0-9_\/]+"
              required
            />
            <div class="form-text text-muted">
              A unique identifier that will be used to include this question in assessments, e.g.{' '}
              <code>add-random-numbers</code>.
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__action" value="save_question" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" class="btn btn-secondary" onClick={onHide}>
            Close
          </button>
          <button type="submit" class="btn btn-primary">
            Finalize question
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
