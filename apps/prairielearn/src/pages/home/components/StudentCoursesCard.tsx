import { Modal } from 'react-bootstrap';

import { useModalState } from '@prairielearn/ui';

import type { StudentHomePageCourse } from '../home.types.js';

export function StudentCoursesCard({
  studentCourses,
  hasInstructorCourses,
  canAddCourses,
  csrfToken,
  urlPrefix,
  isDevMode,
  setShowJoinModal,
}: {
  studentCourses: StudentHomePageCourse[];
  hasInstructorCourses: boolean;
  canAddCourses: boolean;
  csrfToken: string;
  urlPrefix: string;
  isDevMode: boolean;
  setShowJoinModal: (value: boolean) => void;
}) {
  const heading = hasInstructorCourses ? 'Courses with student access' : 'Courses';
  const rejectInvitationModal = useModalState<{
    courseInstanceId: string;
    enrollmentId: string;
  }>();
  const removeCourseModal = useModalState<{
    courseInstanceId: string;
    invitationEnrollmentId?: string;
  }>();

  const uidInvitations = studentCourses.filter(
    (course): course is StudentHomePageCourse & { access_type: 'uid_invitation' } =>
      course.access_type === 'uid_invitation',
  );
  const accessibleCourses = studentCourses.filter(
    (course) => course.access_type === 'institution_access' || course.access_type === 'joined',
  );

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h2>{heading}</h2>
        {canAddCourses && (
          <button
            type="button"
            className="btn btn-light btn-sm ms-auto"
            onClick={() => setShowJoinModal(true)}
          >
            <i className="bi bi-plus-circle me-sm-1" aria-hidden="true" />
            <span className="d-none d-sm-inline">Add course</span>
          </button>
        )}
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
            No courses loaded. Click <strong>"Load from disk"</strong> above and then click{' '}
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
              {uidInvitations.map((entry) => (
                <tr key={`invite-${entry.course_instance.id}`} className="table-warning">
                  <td className="align-middle">
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <div>
                        <span className="fw-semibold">
                          {entry.course_short_name}: {entry.course_title},{' '}
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
                            name="enrollment_id"
                            value={entry.invitation_enrollment_id}
                          />
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
                          onClick={() =>
                            rejectInvitationModal.showWithData({
                              courseInstanceId: entry.course_instance.id,
                              enrollmentId: entry.invitation_enrollment_id,
                            })
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {accessibleCourses.map((entry) => (
                <tr key={entry.course_instance.id}>
                  <td className="align-middle">
                    <div className="d-flex align-items-center justify-content-between gap-2">
                      <a href={`${urlPrefix}/course_instance/${entry.course_instance.id}`}>
                        {entry.course_short_name}: {entry.course_title},{' '}
                        {entry.course_instance.long_name}
                      </a>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          removeCourseModal.showWithData({
                            courseInstanceId: entry.course_instance.id,
                            ...(entry.access_type === 'institution_access'
                              ? { invitationEnrollmentId: entry.invitation_enrollment_id }
                              : {}),
                          })
                        }
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

      <Modal
        show={rejectInvitationModal.show}
        backdrop="static"
        onHide={rejectInvitationModal.onHide}
        onExited={rejectInvitationModal.onExited}
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
          <button type="button" className="btn btn-secondary" onClick={rejectInvitationModal.hide}>
            Cancel
          </button>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="reject_invitation" />
            <input
              type="hidden"
              name="course_instance_id"
              value={rejectInvitationModal.data?.courseInstanceId ?? ''}
            />
            <input
              type="hidden"
              name="enrollment_id"
              value={rejectInvitationModal.data?.enrollmentId ?? ''}
            />
            <button type="submit" className="btn btn-danger">
              Reject invitation
            </button>
          </form>
        </Modal.Footer>
      </Modal>

      <Modal
        show={removeCourseModal.show}
        backdrop="static"
        onHide={removeCourseModal.onHide}
        onExited={removeCourseModal.onExited}
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
          {removeCourseModal.data?.invitationEnrollmentId !== undefined && (
            <p>The course may appear again after your institution's enrollment data is updated.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={removeCourseModal.hide}>
            Cancel
          </button>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input
              type="hidden"
              name="__action"
              value={
                removeCourseModal.data?.invitationEnrollmentId === undefined
                  ? 'unenroll'
                  : 'remove_institution_access'
              }
            />
            <input
              type="hidden"
              name="course_instance_id"
              value={removeCourseModal.data?.courseInstanceId ?? ''}
            />
            {removeCourseModal.data?.invitationEnrollmentId !== undefined && (
              <input
                type="hidden"
                name="enrollment_id"
                value={removeCourseModal.data.invitationEnrollmentId}
              />
            )}
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
