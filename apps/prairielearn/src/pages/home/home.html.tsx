import { useState } from 'preact/hooks';
import { Modal } from 'react-bootstrap';
import { z } from 'zod';

import {
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  type StaffInstitution,
  StudentEnrollmentSchema,
} from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';

export const InstructorHomePageCourseSchema = z.object({
  id: RawStudentCourseSchema.shape.id,
  short_name: RawStudentCourseSchema.shape.short_name,
  title: RawStudentCourseSchema.shape.title,
  can_open_course: z.boolean(),
  course_instances: z.array(
    z.object({
      id: RawStudentCourseSchema.shape.id,
      long_name: RawStudentCourseInstanceSchema.shape.long_name,
      expired: z.boolean(),
    }),
  ),
});
export type InstructorHomePageCourse = z.infer<typeof InstructorHomePageCourseSchema>;

export const StudentHomePageCourseSchema = z.object({
  id: RawStudentCourseInstanceSchema.shape.id,
  course_short_name: RawStudentCourseSchema.shape.short_name,
  course_title: RawStudentCourseSchema.shape.title,
  long_name: RawStudentCourseInstanceSchema.shape.long_name,
  enrollment: StudentEnrollmentSchema,
});
export type StudentHomePageCourse = z.infer<typeof StudentHomePageCourseSchema>;

export function Home({
  canAddCourses,
  csrfToken,
  instructorCourses,
  studentCourses,
  adminInstitutions,
}: {
  canAddCourses: boolean;
  csrfToken: string;
  instructorCourses: InstructorHomePageCourse[];
  studentCourses: StudentHomePageCourse[];
  adminInstitutions: StaffInstitution[];
}) {
  return (
    <>
      <h1 class="visually-hidden">PrairieLearn Homepage</h1>
      <ActionsHeader />

      <div class="container pt-5">
        <DevModeCard />
        <AdminInstitutionsCard adminInstitutions={adminInstitutions} />
        <InstructorCoursesCard instructorCourses={instructorCourses} />
        <StudentCoursesCard
          studentCourses={studentCourses}
          hasInstructorCourses={instructorCourses.length > 0}
          canAddCourses={canAddCourses}
          csrfToken={csrfToken}
        />
      </div>
    </>
  );
}

function ActionsHeader() {
  return (
    <div class="container">
      <div class="row">
        <div class="col-md-6">
          <div class="card rounded-pill my-1">
            <div class="card-body d-flex align-items-center p-2">
              <span class="fa-stack fa-1x me-1" aria-hidden="true">
                <i class="fas fa-circle fa-stack-2x text-secondary" />
                <i class="fas fa-user-graduate fa-stack-1x text-light" />
              </span>
              <h2 class="small p-2 fw-bold text-uppercase text-secondary mb-0">Students</h2>
              <a href={`${config.urlPrefix}/enroll`} class="btn btn-xs btn-outline-primary">
                Add or remove courses
              </a>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card rounded-pill my-1">
            <div class="card-body d-flex align-items-center p-2">
              <span class="fa-stack fa-1x me-1" aria-hidden="true">
                <i class="fas fa-circle fa-stack-2x text-secondary" />
                <i class="fas fa-user-tie fa-stack-1x text-light" />
              </span>
              <h2 class="small p-2 fw-bold text-uppercase text-secondary mb-0">Instructors</h2>
              <a href={`${config.urlPrefix}/request_course`} class="btn btn-xs btn-outline-primary">
                Request course
              </a>
              <a
                href="https://prairielearn.readthedocs.io/en/latest"
                class="btn btn-xs btn-outline-primary ms-2"
              >
                View docs
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DevModeCard() {
  if (!config.devMode) return null;

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>Development Mode</h2>
      </div>
      <div class="card-body">
        <p>
          PrairieLearn is running in Development Mode. Click the
          <strong>"Load from disk"</strong> button above to load question and assessment definitions
          from JSON files on disk.
        </p>
        <p>
          You need to click "Load from disk" every time that a JSON file is changed on disk. Changes
          to other files (JS, HTML, etc) will be automatically loaded every time you navigate to a
          different page or if you reload the current page in your web browser.
        </p>
        <p class="mb-0">
          See the
          <a href="https://prairielearn.readthedocs.io">PrairieLearn documentation</a>
          for information on creating questions and assessments.
        </p>
      </div>
    </div>
  );
}

interface AdminInstitutionsCardProps {
  adminInstitutions: StaffInstitution[];
}

function AdminInstitutionsCard({ adminInstitutions }: AdminInstitutionsCardProps) {
  if (adminInstitutions.length === 0) return null;

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>Institutions with admin access</h2>
      </div>
      <ul class="list-group list-group-flush">
        {adminInstitutions.map((institution) => (
          <li key={institution.id} class="list-group-item">
            <a href={`/pl/institution/${institution.id}/admin/courses`}>
              {institution.short_name}: {institution.long_name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface InstructorCoursesCardProps {
  instructorCourses: InstructorHomePageCourse[];
}

function InstructorCoursesCard({ instructorCourses }: InstructorCoursesCardProps) {
  if (instructorCourses.length === 0) return null;

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>Courses with instructor access</h2>
      </div>

      <div class="table-responsive">
        <table
          class="table table-sm table-hover table-striped"
          aria-label="Courses with instructor access"
        >
          <tbody>
            {instructorCourses.map((course) => (
              <tr key={course.id}>
                <td class="w-50 align-middle">
                  {course.can_open_course ? (
                    <a href={`${config.urlPrefix}/course/${course.id}`}>
                      {course.short_name}: {course.title}
                    </a>
                  ) : (
                    `${course.short_name}: ${course.title}`
                  )}
                </td>
                <td class="js-course-instance-list">
                  <CourseInstanceList
                    courseInstances={course.course_instances.filter((ci) => !ci.expired)}
                  />
                  {course.course_instances.some((ci) => ci.expired) && (
                    <details>
                      <summary class="text-muted small">Older instances</summary>
                      <CourseInstanceList
                        courseInstances={course.course_instances.filter((ci) => ci.expired)}
                      />
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CourseInstanceListProps {
  courseInstances: InstructorHomePageCourse['course_instances'];
}

function CourseInstanceList({ courseInstances }: CourseInstanceListProps) {
  return (
    <div class="d-flex flex-wrap gap-2 my-1">
      {courseInstances.map((courseInstance) => (
        <a
          key={courseInstance.id}
          class="btn btn-outline-primary btn-sm"
          href={`${config.urlPrefix}/course_instance/${courseInstance.id}/instructor`}
        >
          {courseInstance.long_name}
        </a>
      ))}
    </div>
  );
}

interface StudentCoursesCardProps {
  studentCourses: StudentHomePageCourse[];
  hasInstructorCourses: boolean;
  canAddCourses: boolean;
  csrfToken: string;
}

function StudentCoursesCard({
  studentCourses,
  hasInstructorCourses,
  canAddCourses,
  csrfToken,
}: StudentCoursesCardProps) {
  const heading = hasInstructorCourses ? 'Courses with student access' : 'Courses';
  const [rejectingCourseId, setRejectingCourseId] = useState<string | null>(null);

  const invited = studentCourses.filter((ci) => ci.enrollment.status === 'invited');
  const joinedOrOther = studentCourses.filter((ci) => ci.enrollment.status !== 'invited');

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>{heading}</h2>
        {canAddCourses && (
          <a href={`${config.urlPrefix}/enroll`} class="btn btn-light btn-sm ms-auto">
            <i class="fa fa-edit" aria-hidden="true" />
            <span class="d-none d-sm-inline">Add or remove courses</span>
          </a>
        )}
      </div>

      {studentCourses.length === 0 ? (
        hasInstructorCourses ? (
          <div class="card-body">
            No courses found with student access. Courses with instructor access are found in the
            list above.
            {canAddCourses &&
              ' Use the "Add or remove courses" button to add a course as a student.'}
          </div>
        ) : config.devMode ? (
          <div class="card-body">
            No courses loaded. Click <strong>"Load from disk"</strong> above and then click
            <strong>"PrairieLearn"</strong> in the top left corner to come back to this page.
          </div>
        ) : (
          <div class="card-body">
            No courses found.
            {canAddCourses && ' Use the "Add or remove courses" button to add one.'}
          </div>
        )
      ) : (
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label={heading}>
            <tbody>
              {invited.map((courseInstance) => (
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
              {joinedOrOther.map((courseInstance) => (
                <tr key={courseInstance.id}>
                  <td>
                    <a href={`${config.urlPrefix}/course_instance/${courseInstance.id}`}>
                      {courseInstance.course_short_name}: {courseInstance.course_title},
                      {courseInstance.long_name}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        show={rejectingCourseId !== null}
        backdrop="static"
        onHide={() => setRejectingCourseId(null)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Reject invitation?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to reject this invitation? You will need to be re-invited if you
            change your mind later.
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
    </div>
  );
}
