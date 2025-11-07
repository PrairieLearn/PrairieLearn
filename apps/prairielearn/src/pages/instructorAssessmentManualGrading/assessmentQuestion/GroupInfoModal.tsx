import { useCallback, useState } from 'preact/compat';
import { Alert, Button, Modal } from 'react-bootstrap';

interface GroupInfoModalProps {
  modalFor: 'all' | 'selected' | 'ungrouped';
  numOpenInstances: number;
  csrfToken: string;
  show: boolean;
  selectedIds?: string[];
  onHide: () => void;
}

export function GroupInfoModal({
  modalFor,
  numOpenInstances,
  csrfToken,
  show,
  selectedIds = [],
  onHide,
}: GroupInfoModalProps) {
  const [closedOnly, setClosedOnly] = useState('true');

  const handleClose = useCallback(() => {
    onHide();
    setClosedOnly('true'); // Reset to default when closing
  }, [onHide]);

  const getTitle = () => {
    if (modalFor === 'all') {
      return 'Group all submissions';
    } else if (modalFor === 'ungrouped') {
      return 'Group ungrouped submissions';
    } else {
      return 'Group selected submissions';
    }
  };

  return (
    <Modal show={show} size="lg" backdrop="static" keyboard={false} onHide={handleClose}>
      <form method="POST">
        <input type="hidden" name="__csrf_token" value={csrfToken} />

        {modalFor === 'all' && (
          <input type="hidden" name="__action" value="ai_instance_question_group_assessment_all" />
        )}

        {modalFor === 'ungrouped' && (
          <input
            type="hidden"
            name="__action"
            value="ai_instance_question_group_assessment_ungrouped"
          />
        )}

        {modalFor === 'selected' && (
          <>
            <input type="hidden" name="__action" value="batch_action" />
            <input type="hidden" name="batch_action" value="ai_instance_question_group_selected" />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="instance_question_id" value={id} />
            ))}
          </>
        )}

        {numOpenInstances > 0 && (
          <input type="hidden" name="closed_instance_questions_only" value={closedOnly} />
        )}

        <Modal.Header closeButton>
          <Modal.Title>{getTitle()}</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <p>
            Groups student submission answers based on whether they
            <strong> match the correct answer exactly.</strong>
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
                  <p class="my-0">Choose how to apply grouping:</p>
                  <select
                    class="form-select w-auto flex-shrink-0"
                    value={closedOnly}
                    onChange={(e) => setClosedOnly((e.target as HTMLSelectElement).value)}
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
            <div class="d-flex align-items-center justify-content-end gap-2 mb-1">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Group submissions
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
