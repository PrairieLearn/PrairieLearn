import { PageLayout } from '../../components/PageLayout.js';

interface EnrollmentCodeRequiredProps {
  csrfToken: string;
  resLocals: any;
}

export function EnrollmentCodeRequired({ csrfToken, resLocals }: EnrollmentCodeRequiredProps) {
  return PageLayout({
    resLocals,
    pageTitle: 'Enrollment Code Required',
    navContext: {
      type: 'plain',
      page: 'enroll',
    },
    content: (
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

                  <div class="mb-3">
                    <label for="enrollment_code" class="form-label">
                      Enrollment Code
                    </label>
                    <input
                      type="text"
                      class="form-control form-control-lg text-center"
                      id="enrollment_code"
                      name="enrollment_code"
                      placeholder="Enter your enrollment code"
                      autocomplete="off"
                      style="font-family: monospace; letter-spacing: 0.1em;"
                      required
                    />
                    <div class="form-text">
                      Enter the enrollment code exactly as provided by your instructor.
                    </div>
                  </div>

                  <div class="d-grid">
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
    ),
  });
}
