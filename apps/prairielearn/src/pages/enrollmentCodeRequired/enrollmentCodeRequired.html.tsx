import { EnrollmentCodeForm } from '../../components/EnrollmentCodeForm.js';

export function EnrollmentCodeRequired({ csrfToken }: { csrfToken: string }) {
  const handleValidEnrollmentCode = (courseInstanceId: number, enrollmentCode: string) => {
    // Set the hidden input value and submit the form
    const hiddenInput = document.getElementById('enrollment_code_hidden');
    (hiddenInput! as HTMLInputElement).value = enrollmentCode;

    // Submit the form programmatically after setting the hidden input
    const form = document.querySelector('form')!;
    form.submit();
  };

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

                <EnrollmentCodeForm
                  style="modal"
                  onValidEnrollmentCode={handleValidEnrollmentCode}
                />
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
