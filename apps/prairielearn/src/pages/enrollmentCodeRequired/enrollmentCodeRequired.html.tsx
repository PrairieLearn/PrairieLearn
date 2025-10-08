import { EnrollmentCodeForm } from '../../components/EnrollmentCodeForm.js';

export function EnrollmentCodeRequired({ courseInstanceId }: { courseInstanceId: string }) {
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

              <EnrollmentCodeForm style="card" courseInstanceId={courseInstanceId} />
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
