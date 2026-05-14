import { Modal } from 'react-bootstrap';

import { type AppError, AppErrorAlert } from '../../../../lib/client/errors.js';
import { SHORT_NAME_PATTERN } from '../../../../lib/short-name.js';
import type { QuestionsError } from '../../../../trpc/course/questions.js';

export function FinalizeModal({
  csrfToken,
  show,
  onHide,
  defaultTitle,
  defaultQid,
  editErrorUrlPrefix,
  isFinalizing,
  error,
  onDismissError,
  onFinalize,
}: {
  csrfToken: string;
  show: boolean;
  onHide: () => void;
  defaultTitle?: string;
  defaultQid?: string;
  editErrorUrlPrefix: string;
  isFinalizing: boolean;
  error: AppError<QuestionsError['FinalizeDraft']> | null;
  onDismissError: () => void;
  onFinalize: ({ title, qid }: { title: string; qid: string }) => void;
}) {
  return (
    <Modal show={show} size="lg" backdrop="static" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Finalize question</Modal.Title>
      </Modal.Header>
      <form
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onFinalize({
            title: String(formData.get('title') ?? ''),
            qid: String(formData.get('qid') ?? ''),
          });
        }}
      >
        <Modal.Body>
          <AppErrorAlert
            error={error}
            className="mb-3"
            render={{
              EDITOR_JOB_FAILED: ({ message, jobSequenceId }) => (
                <>
                  {message} <a href={`${editErrorUrlPrefix}/${jobSequenceId}`}>View edit error</a>
                </>
              ),
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={onDismissError}
          />
          <div className="alert alert-primary" role="alert">
            After finalizing the question, you will be able to use it on assessments and make manual
            edits.
          </div>
          <div className="mb-3">
            <label htmlFor="question-title" className="form-label">
              Title
            </label>
            <input
              type="text"
              className="form-control"
              id="question-title"
              name="title"
              defaultValue={defaultTitle}
              required
            />
            <div className="form-text text-muted">
              The title of the question as it will appear in the question bank, e.g. "Add two random
              numbers".
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="question-qid" className="form-label">
              QID
            </label>
            <input
              type="text"
              className="form-control"
              id="question-qid"
              name="qid"
              defaultValue={defaultQid}
              pattern={SHORT_NAME_PATTERN}
              required
            />
            <div className="form-text text-muted">
              A unique identifier that will be used to include this question in assessments, e.g.{' '}
              <code>add-random-numbers</code>.
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Close
          </button>
          <button type="submit" className="btn btn-primary" disabled={isFinalizing}>
            {isFinalizing ? 'Finalizing…' : 'Finalize question'}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
