import { useState } from 'preact/hooks';
import { Modal } from 'react-bootstrap';
import z from 'zod';

import { EnrollmentCodeForm } from '../../../components/EnrollmentCodeForm.js';
import {
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  StudentEnrollmentSchema,
} from '../../../lib/client/safe-db-types.js';

export const StudentHomePageCourseSchema = z.object({
  course_instance: RawStudentCourseInstanceSchema,
  course_short_name: RawStudentCourseSchema.shape.short_name,
  course_title: RawStudentCourseSchema.shape.title,
  enrollment: StudentEnrollmentSchema,
});
export type StudentHomePageCourse = z.infer<typeof StudentHomePageCourseSchema>;

export function StudentCoursesCard({
  studentCourses,
  hasInstructorCourses,
  canAddCourses,
  csrfToken,
  urlPrefix,
  isDevMode,
  enrollmentManagementEnabled,
}: {
  studentCourses: StudentHomePageCourse[];
  hasInstructorCourses: boolean;
  canAddCourses: boolean;
  csrfToken: string;
  urlPrefix: string;
  isDevMode: boolean;
  enrollmentManagementEnabled: boolean;
}) {
  const heading = hasInstructorCourses ? 'Courses with student access' : 'Courses';
  const [rejectingCourseId, setRejectingCourseId] = useState<string | null>(null);
  const [removingCourseId, setRemovingCourseId] = useState<string | null>(null);

  const invited: StudentHomePageCourse[] = studentCourses.filter(
    (ci) => ci.enrollment.status === 'invited',
  );
  const joined: StudentHomePageCourse[] = studentCourses.filter(
    (ci) => ci.enrollment.status === 'joined',
  );

  const [showEnrollmentCodeModal, setShowEnrollmentCodeModal] = useState(false);

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h2>{heading}</h2>
        {canAddCourses &&
          (enrollmentManagementEnabled ? (
            <button
              type="button"
              className="btn btn-light btn-sm ms-auto"
              onClick={() => setShowEnrollmentCodeModal(true)}
            >
              <i className="bi bi-plus-circle me-sm-1" aria-hidden="true" />
              <span className="d-none d-sm-inline">Add course</span>
            </button>
          ) : (
            <a href={`${urlPrefix}/enroll`} className="btn btn-light btn-sm ms-auto">
              <i className="bi bi-plus-circle me-sm-1" aria-hidden="true" />
              <span className="d-none d-sm-inline">Add course</span>
            </a>
          ))}
      </div>

      {studentCourses.length === 0 ? (
        hasInstructorCourses ? (
          <div className="card-body">
            No courses found with student access. Courses with instructor access are found in the
            list above.
            {canAddCourses && ' Use the "Add course" button to add a course as a student.'}
          </div>
        ) : isDevMode ? (
          <div className="card-body">
            No courses loaded. Click <strong>"Load from disk"</strong> above and then click
            <strong>"PrairieLearn"</strong> in the top left corner to come back to this page.
          </div>
        ) : (
          <div className="card-body">
            No courses found.
            {canAddCourses && ' Use the "Add course" button to add one.'}
          </div>
        )
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover table-striped" aria-label={heading}>
            <tbody>
              {invited.map((entry: StudentHomePageCourse) => (
                <tr key={`invite-${entry.course_instance.id}`} className="table-warning">
                  <td className="align-middle">
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <div>
                        <span className="fw-semibold">
                          {entry.course_short_name}: {entry.course_title},
                          {entry.course_instance.long_name}
                        </span>
                        <span className="ms-2 badge bg-warning text-dark">Invitation</span>
                      </div>
                      <div className="d-flex gap-2">
                        <form method="POST">
                          <input type="hidden" name="__action" value="accept_invitation" />
                          <input type="hidden" name="__csrf_token" value={csrfToken} />
                          <input
                            type="hidden"
                            name="course_instance_id"
                            value={entry.course_instance.id}
                          />
                          <button type="submit" className="btn btn-primary btn-sm">
                            Accept
                          </button>
                        </form>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setRejectingCourseId(entry.course_instance.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {joined.map((entry) => (
                <tr key={entry.course_instance.id}>
                  <td className="align-middle">
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <a href={`${urlPrefix}/course_instance/${entry.course_instance.id}`}>
                        {entry.course_short_name}: {entry.course_title},
                        {entry.course_instance.long_name}
                      </a>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setRemovingCourseId(entry.course_instance.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EnrollmentCodeForm
        style="modal"
        show={showEnrollmentCodeModal}
        onHide={() => setShowEnrollmentCodeModal(false)}
      />

      <Modal
        show={rejectingCourseId !== null}
        backdrop="static"
        onHide={() => setRejectingCourseId(null)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Reject invitation</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to reject this invitation? If the course doesn't allow
            self-enrollment, you will need to be reinvited by an instructor.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setRejectingCourseId(null)}
          >
            Cancel
          </button>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="reject_invitation" />
            <input type="hidden" name="course_instance_id" value={rejectingCourseId ?? ''} />
            <button type="submit" className="btn btn-danger">
              Reject invitation
            </button>
          </form>
        </Modal.Footer>
      </Modal>

      <Modal
        show={removingCourseId !== null}
        backdrop="static"
        onHide={() => setRemovingCourseId(null)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Remove course</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to remove this course from your PrairieLearn account?</p>
          <p>
            Removing courses here only affects what is visible to you on PrairieLearn. This does not
            change your university course registration.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={() => setRemovingCourseId(null)}>
            Cancel
          </button>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="unenroll" />
            <input type="hidden" name="course_instance_id" value={removingCourseId ?? ''} />
            <button type="submit" className="btn btn-danger">
              Remove course
            </button>
          </form>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

StudentCoursesCard.displayName = 'StudentCoursesCard';
