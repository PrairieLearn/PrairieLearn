import { useEffect, useRef, useState } from 'preact/hooks';

import type { CourseInstance } from '../lib/db-types.js';

export function DeleteCourseInstanceModal({
  shortName,
  enrolledCount,
  csrfToken,
}: {
  shortName: CourseInstance['short_name'];
  enrolledCount: number;
  csrfToken: string;
}) {
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState({
    impact: false,
    irreversible: false,
    recovery: false,
  });
  const [confirmationText, setConfirmationText] = useState('');

  const allChecked = Object.values(checks).every(Boolean);
  const canContinue = step === 1 ? allChecked : confirmationText === shortName;

  const labelId = 'deleteCourseInstanceModalLabel';

  // Reset state whenever the Bootstrap modal fully hides (after fade animation)
  const modalRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;

    const handleHidden = () => {
      setStep(1);
      setChecks({ impact: false, recovery: false, irreversible: false });
      setConfirmationText('');
    };

    // Bootstrap dispatches 'hidden.bs.modal' after the hide transition completes
    el.addEventListener('hidden.bs.modal', handleHidden);
    return () => {
      el.removeEventListener('hidden.bs.modal', handleHidden);
    };
  }, []);

  // Focus the confirmation text input when moving to the second step.
  const confirmationTextRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (step === 2) {
      confirmationTextRef.current?.focus();
    }
  }, [step]);

  return (
    <div
      ref={modalRef}
      class="modal fade"
      id="deleteCourseInstanceModal"
      tabIndex={-1}
      role="dialog"
      aria-labelledby={labelId}
    >
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h4" id={labelId}>
              Delete course instance
            </h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
          </div>
          <div class="modal-body">
            {step === 1 && (
              <div>
                <div role="alert" class="alert alert-warning mb-3">
                  Bad things will happen if you don't read this!
                </div>
                <div class="form-check mb-2">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="impact"
                    checked={checks.impact}
                    onChange={(e) => setChecks((c) => ({ ...c, impact: e.currentTarget.checked }))}
                  />
                  <label class="form-check-label" for="impact">
                    I understand that <strong>{enrolledCount}</strong> enrolled{' '}
                    {enrolledCount === 1 ? 'student' : 'students'} will lose access to this course
                    instance.
                  </label>
                </div>
                <div class="form-check mb-3">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="irreversible"
                    checked={checks.irreversible}
                    onChange={(e) =>
                      setChecks((c) => ({ ...c, irreversible: e.currentTarget.checked }))
                    }
                  />
                  <label class="form-check-label" for="irreversible">
                    I understand that once deleted, this course instance cannot be restored through
                    the PrairieLearn web interface.
                  </label>
                </div>
                <div class="form-check mb-2">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="recovery"
                    checked={checks.recovery}
                    onChange={(e) =>
                      setChecks((c) => ({ ...c, recovery: e.currentTarget.checked }))
                    }
                  />
                  <label class="form-check-label" for="recovery">
                    I understand data recovery requires manual Git operations on the course
                    repository.
                  </label>
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <div class="card text-bg-light mb-3">
                  <div class="card-body">
                    <h3 class="h5 card-title">Recovery information</h3>
                    <p>If you need to recover this course instance, you will need to:</p>
                    <ol class="mb-0">
                      <li>Access the course's Git repository</li>
                      <li>
                        Use Git commands to restore the course instance from the commit history
                      </li>
                      <li>Push your changes</li>
                      <li>Sync your changes to PrairieLearn</li>
                    </ol>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmShortName" class="form-label">
                    Type <strong>{shortName}</strong> to confirm deletion:
                  </label>
                  <input
                    ref={confirmationTextRef}
                    id="confirmShortName"
                    name="confirmShortName"
                    class="form-control"
                    value={confirmationText}
                    autoComplete="off"
                    onInput={(e) => setConfirmationText(e.currentTarget.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <div class="modal-footer">
            {step === 1 && (
              <>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={!canContinue}
                  onClick={() => setStep(2)}
                >
                  Continue
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                  Cancel
                </button>
                <form method="POST">
                  <input type="hidden" name="__action" value="delete_course_instance" />
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <button type="submit" class="btn btn-danger" disabled={!canContinue}>
                    Delete
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

DeleteCourseInstanceModal.displayName = 'DeleteCourseInstanceModal';
