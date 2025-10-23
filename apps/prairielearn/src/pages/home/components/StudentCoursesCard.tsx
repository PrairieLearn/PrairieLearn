import { useState } from 'preact/hooks';
import { Modal } from 'react-bootstrap';
import z from 'zod';

import { EnrollmentCodeForm } from '../../../components/EnrollmentCodeForm.js';
import {
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  StudentEnrollmentSchema,
} from '../../../lib/client/safe-db-types.js';
import { CourseInstancePublishingExtensionSchema } from '../../../lib/db-types.js';

export const StudentHomePageCourseSchema = z.object({
  id: RawStudentCourseInstanceSchema.shape.id,
  course_short_name: RawStudentCourseSchema.shape.short_name,
  course_title: RawStudentCourseSchema.shape.title,
  long_name: RawStudentCourseInstanceSchema.shape.long_name,
  enrollment: StudentEnrollmentSchema,
  publishing_extensions: z.array(CourseInstancePublishingExtensionSchema).optional(), // Optional for legacy courses
});
export type StudentHomePageCourse = z.infer<typeof StudentHomePageCourseSchema>;

interface StudentCoursesCardProps {
  studentCourses: StudentHomePageCourse[];
  hasInstructorCourses: boolean;
  canAddCourses: boolean;
  csrfToken: string;
  urlPrefix: string;
  isDevMode: boolean;
  enrollmentManagementEnabled: boolean;
}

export function StudentCoursesCard({
  studentCourses,
  hasInstructorCourses,
  canAddCourses,
  csrfToken,
  urlPrefix,
  isDevMode,
  enrollmentManagementEnabled,
}: StudentCoursesCardProps) {
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
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>{heading}</h2>
        {canAddCourses &&
          (enrollmentManagementEnabled ? (
            <button
              type="button"
              class="btn btn-light btn-sm ms-auto"
              onClick={() => setShowEnrollmentCodeModal(true)}
            >
              <i class="bi bi-plus-circle me-sm-1" aria-hidden="true" />
              <span class="d-none d-sm-inline">Add course</span>
            </button>
          ) : (
            <a href={`${urlPrefix}/enroll`} class="btn btn-light btn-sm ms-auto">
              <i class="bi bi-plus-circle me-sm-1" aria-hidden="true" />
              <span class="d-none d-sm-inline">Add course</span>
            </a>
          ))}
      </div>

      {studentCourses.length === 0 ? (
        hasInstructorCourses ? (
          <div class="card-body">
            No courses found with student access. Courses with instructor access are found in the
            list above.
            {canAddCourses && ' Use the "Add course" button to add a course as a student.'}
          </div>
        ) : isDevMode ? (
          <div class="card-body">
            No courses loaded. Click <strong>"Load from disk"</strong> above and then click
            <strong>"PrairieLearn"</strong> in the top left corner to come back to this page.
          </div>
        ) : (
          <div class="card-body">
            No courses found.
            {canAddCourses && ' Use the "Add course" button to add one.'}
          </div>
        )
      ) : (
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label={heading}>
            <tbody>
              {invited.map((courseInstance: StudentHomePageCourse) => (
                <tr key={`invite-${courseInstance.id}`} class="table-warning">
                  <td class="align-middle">
                    <div class="d-flex align-items-center justify-content-between gap-2">
                      <div>
                        <span class="fw-semibold">
                          {courseInstance.course_short_name}: {courseInstance.course_title},
                          {courseInstance.long_name}
                        </span>
                        <span class="ms-2 badge bg-warning text-dark">Invitation</span>
                      </div>
                      <div class="d-flex gap-2">
                        <form method="POST">
                          <input type="hidden" name="__action" value="accept_invitation" />
                          <input type="hidden" name="__csrf_token" value={csrfToken} />
                          <input
                            type="hidden"
                            name="course_instance_id"
                            value={courseInstance.id}
                          />
                          <button type="submit" class="btn btn-primary btn-sm">
                            Accept
                          </button>
                        </form>
                        <button
                          type="button"
                          class="btn btn-danger btn-sm"
                          onClick={() => setRejectingCourseId(courseInstance.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {joined.map((courseInstance) => (
                <tr key={courseInstance.id}>
                  <td class="align-middle">
                    <div class="d-flex align-items-center justify-content-between gap-2">
                      <a href={`${urlPrefix}/course_instance/${courseInstance.id}`}>
                        {courseInstance.course_short_name}: {courseInstance.course_title},
                        {courseInstance.long_name}
                      </a>
                      {courseInstance.publishing_extensions &&
                        courseInstance.publishing_extensions.length > 0 && (
                          <span
                            class="badge bg-info text-dark ms-2"
                            title="Has publishing extensions"
                          >
                            <i class="fa fa-clock" aria-hidden="true" />
                            {courseInstance.publishing_extensions.length} extension
                            {courseInstance.publishing_extensions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        onClick={() => setRemovingCourseId(courseInstance.id)}
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
            Are you sure you want to reject this invitation? You will need to be reinvited if you
            want to join this class again later.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => setRejectingCourseId(null)}
          >
            Cancel
          </button>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="reject_invitation" />
            <input type="hidden" name="course_instance_id" value={rejectingCourseId ?? ''} />
            <button type="submit" class="btn btn-danger">
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
          <button type="button" class="btn btn-secondary" onClick={() => setRemovingCourseId(null)}>
            Cancel
          </button>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="unenroll" />
            <input type="hidden" name="course_instance_id" value={removingCourseId ?? ''} />
            <button type="submit" class="btn btn-danger">
              Remove course
            </button>
          </form>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

StudentCoursesCard.displayName = 'StudentCoursesCard';
