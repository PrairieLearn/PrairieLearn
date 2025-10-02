import { EnrollmentCodeInput } from '../../components/EnrollmentCodeInput.js';

interface EnrollmentCodeRequiredProps {
  csrfToken: string;
}

export function EnrollmentCodeRequired({ csrfToken }: EnrollmentCodeRequiredProps) {
  return (
    <div class="container-fluid">
      <div class="row justify-content-center">
        <div class="col-lg-8 col-xl-6">
          <div class="card">
            <div class="card-header bg-primary text-white">
              <h4 class="mb-0">Enter Enrollment Code</h4>
            </div>
            <div class="card-body">
              <p class="mb-4">
                To access this course, you need to enter a valid enrollment code. Please enter the
                code provided by your instructor.
              </p>

              <form method="POST">
                <input type="hidden" name="__csrf_token" value={csrfToken} />
                <input type="hidden" name="__action" value="validate_code" />
                <input type="hidden" name="enrollment_code" id="enrollment_code_hidden" />

                <EnrollmentCodeInput
                  onSubmit={async (fullCode) => {
                    // Set the hidden input value and submit the form
                    const hiddenInput = document.getElementById(
                      'enrollment_code_hidden',
                    ) as HTMLInputElement;
                    hiddenInput.value = fullCode;
                    // Submit the form
                    const form = hiddenInput.closest('form');
                    if (form) {
                      form.submit();
                    }
                  }}
                />

                <div class="d-grid mt-3">
                  <button type="submit" class="btn btn-primary btn-lg">
                    Join Course
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div class="text-center mt-4">
            <p class="text-muted small">
              Don't have an enrollment code? Contact your instructor for assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

EnrollmentCodeRequired.displayName = 'EnrollmentCodeRequired';
