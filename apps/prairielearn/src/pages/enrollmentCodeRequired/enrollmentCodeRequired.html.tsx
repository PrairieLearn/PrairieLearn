import { EnrollmentCodeForm } from '../../components/EnrollmentCodeForm.js';

export function EnrollmentCodeRequired({ courseInstanceId }: { courseInstanceId: string }) {
  return (
    <div className="container-fluid">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">Enter Enrollment Code</h4>
            </div>
            <div className="card-body">
              <p className="mb-4">
                To access this course, you need to enter a valid enrollment code. Please enter the
                code provided by your instructor.
              </p>

              <EnrollmentCodeForm style="raw-form" courseInstanceId={courseInstanceId} />
            </div>
            <div className="card-footer">
              <div className="text-center text-muted small my-2">
                Don't have an enrollment code? Contact your instructor for assistance.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

EnrollmentCodeRequired.displayName = 'EnrollmentCodeRequired';
