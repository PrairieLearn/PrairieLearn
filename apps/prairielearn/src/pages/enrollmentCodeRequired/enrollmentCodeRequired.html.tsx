import { EnrollmentCodeForm } from '../../components/EnrollmentCodeForm.js';

export function EnrollmentCodeRequired({ courseInstanceId }: { courseInstanceId: string }) {
  return (
    <div className="container-fluid">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h1 className="mb-0">Join course via enrollment code</h1>
            </div>
            <div className="card-body">
              <EnrollmentCodeForm
                style="raw-form"
                courseInstanceId={courseInstanceId}
                leadingContent={
                  <p>
                    To access this course, enter the enrollment code provided by your instructor.
                  </p>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

EnrollmentCodeRequired.displayName = 'EnrollmentCodeRequired';
