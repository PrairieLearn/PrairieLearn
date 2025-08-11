import { useState } from 'preact/hooks';

export function DeleteCourseInstanceModal({
  shortName,
  enrolledCount,
  repo,
  csrfToken,
}: {
  shortName: string;
  enrolledCount: number;
  repo: string;
  csrfToken: string;
}) {
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState({
    impact: false,
    recovery: false,
    irreversible: false,
  });
  const [typed, setTyped] = useState('');

  const allChecked = Object.values(checks).every(Boolean);
  const canContinue = step === 1 ? allChecked : typed === shortName;

  const labelId = 'deleteCourseInstanceModalLabel';

  return (
    <div
      class="modal fade"
      id="deleteCourseInstanceModal"
      tabIndex={-1}
      role="dialog"
      aria-labelledby={labelId}
      aria-hidden="true"
    >
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h4" id={labelId}>
              Delete course instance
            </h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
          </div>
          <form method="POST" autoComplete="off">
            <input type="hidden" name="__action" value="delete_course_instance" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <div class="modal-body">
              {step === 1 && (
                <div>
                  <div class="form-check mb-2">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="impact"
                      checked={checks.impact}
                      onChange={(e) =>
                        setChecks((c) => ({ ...c, impact: e.currentTarget.checked }))
                      }
                    />
                    <label class="form-check-label" for="impact">
                      I understand this will impact <strong>{enrolledCount}</strong> enrolled
                      students. Students will lose access to all course materials, their submission
                      history, and grades.
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
                      I understand data recovery requires manual Git operations. Course data can
                      only be recovered through manual Git operations on the repository:{' '}
                      <code>{repo}</code>
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
                      I understand this action is irreversible through the LMS. There is no "undo"
                      button. Once deleted, the course instance cannot be restored through the
                      interface.
                    </label>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h5>Recovery information</h5>
                  <ul class="mb-3">
                    <li>
                      Access the Git repository: <code>{repo}</code>
                    </li>
                    <li>Use Git commands to restore the course data from commit history</li>
                    <li>Manually recreate the course instance in PrairieLearn</li>
                    <li>Re-import course materials and student data if needed</li>
                  </ul>
                  <div class="mb-3">
                    <label htmlFor="confirmShortName" class="form-label">
                      Type <strong>{shortName}</strong> to confirm deletion
                    </label>
                    <input
                      id="confirmShortName"
                      name="confirmShortName"
                      class="form-control"
                      value={typed}
                      autoComplete="off"
                      aria-describedby="confirmShortNameHelp"
                      onInput={(e) => setTyped(e.currentTarget.value)}
                    />
                    <small id="confirmShortNameHelp" class="form-text text-muted">
                      This safeguard prevents accidental deletion.
                    </small>
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
                  <button type="submit" class="btn btn-danger" disabled={!canContinue}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

DeleteCourseInstanceModal.displayName = 'DeleteCourseInstanceModal';
