import { useCallback, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import { assertNever } from '@prairielearn/utils';

import type { useManualGradingActions } from '../utils/useManualGradingActions.js';

const defaultClosedSubmissionsOnly = true;

export type GroupInfoModalState =
  | { type: 'selected'; ids: string[] }
  | { type: 'all' }
  | { type: 'ungrouped' }
  | null;

export function GroupInfoModal({
  modalState,
  numOpenInstances,
  mutation,
  onHide,
}: {
  modalState: GroupInfoModalState;
  numOpenInstances: number;
  mutation: ReturnType<typeof useManualGradingActions>['groupSubmissionMutation'];
  onHide: () => void;
}) {
  const [closedSubmissionsOnly, setClosedSubmissionsOnly] = useState(true);

  const handleClose = useCallback(() => {
    setClosedSubmissionsOnly(defaultClosedSubmissionsOnly);
    mutation.reset();
    onHide();
  }, [onHide, mutation]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!modalState) return;

      switch (modalState.type) {
        case 'selected': {
          mutation.mutate(
            {
              selection: modalState.ids,
              closed_instance_questions_only: closedSubmissionsOnly,
            },
            {
              onSuccess: onHide,
            },
          );
          break;
        }
        case 'all': {
          mutation.mutate(
            {
              selection: 'all',
              closed_instance_questions_only: closedSubmissionsOnly,
            },
            {
              onSuccess: onHide,
            },
          );
          break;
        }
        case 'ungrouped': {
          mutation.mutate(
            {
              selection: 'ungrouped',
              closed_instance_questions_only: closedSubmissionsOnly,
            },
            {
              onSuccess: onHide,
            },
          );
          break;
        }
        default:
          assertNever(modalState);
      }
    },
    [modalState, closedSubmissionsOnly, mutation, onHide],
  );

  const getTitle = () => {
    if (modalState == null) return '';

    if (modalState.type === 'all') {
      return 'Group all submissions';
    } else if (modalState.type === 'ungrouped') {
      return 'Group ungrouped submissions';
    } else {
      return 'Group selected submissions';
    }
  };

  return (
    <Modal
      show={modalState != null}
      size="lg"
      backdrop="static"
      keyboard={false}
      onHide={handleClose}
    >
      <form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{getTitle()}</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <p>
            Groups student submission answers based on whether they{' '}
            <strong>match the correct answer exactly.</strong>
          </p>

          <p>Answers that match go into one group, and those that don't are grouped separately.</p>

          <p>
            To enable grouping, the correct answer must be provided in <code>pl-answer-panel</code>.
          </p>

          <p>
            Grouping checks for exact equivalence to the final answer, considering only the boxed or
            final answer to form groups.
          </p>

          <p>Examples of what can and can't be grouped:</p>

          <div
            className="d-grid border rounded overflow-hidden"
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <div className="px-2 py-1 bg-light fw-bold border-end">Can group</div>
            <div className="px-2 py-1 bg-light fw-bold">Can't group</div>

            <div className="px-2 py-1 border-top border-end">Mathematical Equations</div>
            <div className="px-2 py-1 border-top">Essays</div>

            <div className="px-2 py-1 border-top border-end">Mechanical Formulas</div>
            <div className="px-2 py-1 border-top">Free Response Questions</div>

            <div className="px-2 py-1 border-top border-end">Exact String Inputs</div>
            <div className="px-2 py-1 border-top">Freeform Code</div>

            <div className="px-2 py-1 border-top border-end">
              Handwritten submissions with 1 correct answer
            </div>
            <div className="px-2 py-1 border-top">
              Handwritten submissions with 2+ correct answers
            </div>
          </div>

          {numOpenInstances > 0 && (
            <Alert variant="warning" className="mt-3">
              <div className="row g-2">
                <div className="col-12 col-md-6">
                  <p className="my-0">
                    This assessment has{' '}
                    {numOpenInstances === 1
                      ? '1 open instance that '
                      : `${numOpenInstances} open instances, which `}
                    may contain submissions selected for grouping.
                  </p>
                </div>
                <div className="col-12 col-md-6 d-flex flex-column gap-2">
                  <label htmlFor="grouping-application-select" className="my-0">
                    Choose how to apply grouping:
                  </label>
                  <select
                    id="grouping-application-select"
                    className="form-select w-auto flex-shrink-0"
                    value={closedSubmissionsOnly ? 'true' : 'false'}
                    onChange={(e) => setClosedSubmissionsOnly(e.currentTarget.value === 'true')}
                  >
                    <option value="true">Only group closed submissions</option>
                    <option value="false">Group open & closed submissions</option>
                  </select>
                </div>
              </div>
            </Alert>
          )}
        </Modal.Body>

        <Modal.Footer>
          <div className="m-0 w-100">
            {mutation.isError && (
              <Alert variant="danger" className="mb-2" dismissible onClose={() => mutation.reset()}>
                <strong>Error:</strong> {mutation.error.message}
              </Alert>
            )}
            <div className="d-flex align-items-center justify-content-end gap-2 mb-1">
              <Button variant="secondary" disabled={mutation.isPending} onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" disabled={mutation.isPending} type="submit">
                {mutation.isPending ? 'Submitting...' : 'Group submissions'}
              </Button>
            </div>
            <small className="text-muted my-0 text-end d-block">
              AI can make mistakes. Review groups before grading.
            </small>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
