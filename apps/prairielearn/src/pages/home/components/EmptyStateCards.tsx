import { useState } from 'preact/compat';

import { EnrollmentCodeForm } from '../../../components/EnrollmentCodeForm.js';

export function EmptyStateCards({
  urlPrefix,
  enrollmentManagementEnabled,
}: {
  urlPrefix: string;
  enrollmentManagementEnabled: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <>
      <div class="row">
        <div class="col-lg-6 mb-4">
          <div class="card h-100">
            <div class="card-body text-center d-flex flex-column">
              <div class="mb-3">
                <i class="bi bi-person-badge text-primary" style="font-size: 3rem;" />
              </div>
              <h3 class="card-title mb-3">Students</h3>
              <p class="card-text mb-4">Add a course and start learning.</p>
              <div class="mt-auto">
                {enrollmentManagementEnabled ? (
                  <button
                    type="button"
                    class="btn btn-primary w-100 d-flex gap-2 justify-content-center"
                    onClick={() => setShow(true)}
                  >
                    <i class="bi bi-plus-circle" />
                    Add course
                  </button>
                ) : (
                  <a
                    href={`${urlPrefix}/enroll`}
                    class="btn btn-primary d-flex gap-2 justify-content-center"
                  >
                    <i class="bi bi-plus-circle" />
                    Add course
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-6 mb-4">
          <div class="card h-100">
            <div class="card-body text-center d-flex flex-column">
              <div class="mb-3">
                <i class="bi bi-mortarboard text-primary" style="font-size: 3rem;" />
              </div>
              <h3 class="card-title mb-3">Instructors</h3>
              <p class="card-text mb-4">Create and manage courses for your students.</p>
              <div class="mt-auto">
                <div class="d-flex flex-wrap gap-2">
                  <a
                    href={`${urlPrefix}/request_course`}
                    class="btn btn-primary flex-fill d-flex gap-2 justify-content-center"
                  >
                    <i class="bi bi-book" />
                    Request course
                  </a>
                  <a
                    href="https://prairielearn.readthedocs.io/en/latest"
                    class="btn btn-outline-primary flex-fill d-flex gap-2 justify-content-center"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i class="bi bi-journal-text" aria-hidden="true" />
                    View docs
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <EnrollmentCodeForm style="modal" show={show} onHide={() => setShow(false)} />
    </>
  );
}

EmptyStateCards.displayName = 'EmptyStateCards';
