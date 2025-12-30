import clsx from 'clsx';
import { useEffect, useRef, useState } from 'preact/hooks';

export function DeleteCourseInstanceModal({
  shortName,
  enrolledCount,
  csrfToken,
}: {
  shortName: string;
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

  return (
    <div
      ref={modalRef}
      className="modal fade"
      id="deleteCourseInstanceModal"
      tabIndex={-1}
      role="dialog"
      aria-labelledby={labelId}
    >
      <div className="modal-dialog" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title h4" id={labelId}>
              Delete course instance
            </h2>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
          </div>
          <div className="modal-body">
            {step === 1 && (
              <div>
                <div role="alert" className="alert alert-warning mb-3">
                  Bad things will happen if you don't read this!
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="impact"
                    checked={checks.impact}
                    onChange={(e) => setChecks((c) => ({ ...c, impact: e.currentTarget.checked }))}
                  />
                  <label className="form-check-label" for="impact">
                    I understand that <strong>{enrolledCount}</strong> enrolled{' '}
                    {enrolledCount === 1 ? 'student' : 'students'} will lose access to this course
                    instance.
                  </label>
                </div>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="irreversible"
                    checked={checks.irreversible}
                    onChange={(e) =>
                      setChecks((c) => ({ ...c, irreversible: e.currentTarget.checked }))
                    }
                  />
                  <label className="form-check-label" for="irreversible">
                    I understand that once deleted, this course instance cannot be restored through
                    the PrairieLearn web interface.
                  </label>
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="recovery"
                    checked={checks.recovery}
                    onChange={(e) =>
                      setChecks((c) => ({ ...c, recovery: e.currentTarget.checked }))
                    }
                  />
                  <label className="form-check-label" for="recovery">
                    I understand data recovery requires manual Git operations on the course
                    repository.
                  </label>
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <div className="card text-bg-light mb-3">
                  <div className="card-body">
                    <h3 className="h5 card-title">Recovery information</h3>
                    <p>If you need to recover this course instance, you will need to:</p>
                    <ol className="mb-0">
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
                  <label for="confirmShortName" className="form-label">
                    Type <strong>{shortName}</strong> to confirm deletion:
                  </label>
                  <input
                    id="confirmShortName"
                    name="confirmShortName"
                    className="form-control"
                    value={confirmationText}
                    autoComplete="off"
                    // eslint-disable-next-line jsx-a11y-x/no-autofocus
                    autoFocus
                    onInput={(e) => setConfirmationText(e.currentTarget.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
              Cancel
            </button>
            {step === 1 && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canContinue}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            )}
            {/* Hide with CSS, not conditional rendering, so that the tests can find the form */}
            <form method="POST" className={clsx({ 'd-none': step !== 2 })}>
              <input type="hidden" name="__action" value="delete_course_instance" />
              <input type="hidden" name="__csrf_token" value={csrfToken} />
              <button type="submit" className="btn btn-danger" disabled={!canContinue}>
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

DeleteCourseInstanceModal.displayName = 'DeleteCourseInstanceModal';
