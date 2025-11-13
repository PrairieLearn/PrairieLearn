import { useCallback, useEffect, useState } from 'preact/compat';
import { Alert, Button, Modal } from 'react-bootstrap';

import { assertNever } from '../../../../lib/types.js';
import type { useManualGradingActions } from '../utils/useManualGradingActions.js';

const defaultClosedOnly = true;

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
  const [closedOnly, setClosedOnly] = useState(defaultClosedOnly);

  // Close modal on successful mutation
  // eslint-disable-next-line react-you-might-not-need-an-effect/no-manage-parent
  useEffect(() => {
    if (mutation.isSuccess) {
      onHide();
    }
  }, [mutation.isSuccess, onHide]);

  const handleClose = useCallback(() => {
    setClosedOnly(defaultClosedOnly);
    mutation.reset();
    onHide();
  }, [onHide, mutation]);

  const handleSubmit = useCallback(
    (e: Event) => {
      e.preventDefault();
      if (!modalState) return;

      switch (modalState.type) {
        case 'selected': {
          mutation.mutate({
            action: 'batch_action',
            closedOnly,
            numOpenInstances,
            instanceQuestionIds: modalState.ids,
          });
          break;
        }
        case 'all': {
          mutation.mutate({
            action: 'ai_instance_question_group_assessment_all',
            closedOnly,
            numOpenInstances,
          });
          break;
        }
        case 'ungrouped': {
          mutation.mutate({
            action: 'ai_instance_question_group_assessment_ungrouped',
            closedOnly,
            numOpenInstances,
          });
          break;
        }
        default:
          assertNever(modalState);
      }
    },
    [modalState, closedOnly, numOpenInstances, mutation],
  );

  if (!modalState) return null;

  const getTitle = () => {
    if (modalState.type === 'all') {
      return 'Group all submissions';
    } else if (modalState.type === 'ungrouped') {
      return 'Group ungrouped submissions';
    } else {
      return 'Group selected submissions';
    }
  };

  return (
    <Modal show={true} size="lg" backdrop="static" keyboard={false} onHide={handleClose}>
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
            class="d-grid border rounded overflow-hidden"
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <div class="px-2 py-1 bg-light fw-bold border-end">Can group</div>
            <div class="px-2 py-1 bg-light fw-bold">Can't group</div>

            <div class="px-2 py-1 border-top border-end">Mathematical Equations</div>
            <div class="px-2 py-1 border-top">Essays</div>

            <div class="px-2 py-1 border-top border-end">Mechanical Formulas</div>
            <div class="px-2 py-1 border-top">Free Response Questions</div>

            <div class="px-2 py-1 border-top border-end">Exact String Inputs</div>
            <div class="px-2 py-1 border-top">Freeform Code</div>

            <div class="px-2 py-1 border-top border-end">
              Handwritten submissions with 1 correct answer
            </div>
            <div class="px-2 py-1 border-top">Handwritten submissions with 2+ correct answers</div>
          </div>

          {numOpenInstances > 0 && (
            <Alert variant="warning" class="mt-3">
              <div class="row g-2">
                <div class="col-12 col-md-6">
                  <p class="my-0">
                    This assessment has{' '}
                    {numOpenInstances === 1
                      ? '1 open instance that '
                      : `${numOpenInstances} open instances, which `}
                    may contain submissions selected for grouping.
                  </p>
                </div>
                <div class="col-12 col-md-6 d-flex flex-column gap-2">
                  <label for="grouping-application-select" class="my-0">
                    Choose how to apply grouping:
                  </label>
                  <select
                    id="grouping-application-select"
                    class="form-select w-auto flex-shrink-0"
                    value={closedOnly ? 'true' : 'false'}
                    onChange={(e) =>
                      setClosedOnly((e.target as HTMLSelectElement).value === 'true')
                    }
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
          <div class="m-0 w-100">
            {mutation.isError && (
              <Alert variant="danger" class="mb-2">
                <strong>Error:</strong> {mutation.error.message}
              </Alert>
            )}
            <div class="d-flex align-items-center justify-content-end gap-2 mb-1">
              <Button variant="secondary" disabled={mutation.isPending} onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" disabled={mutation.isPending} type="submit">
                {mutation.isPending ? 'Submitting...' : 'Group submissions'}
              </Button>
            </div>
            <small class="text-muted my-0 text-end d-block">
              AI can make mistakes. Review groups before grading.
            </small>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
