import { useState } from 'preact/compat';
import { z } from 'zod';

import { Hydrate } from '@prairielearn/preact/server';

import {
  RawStudentCourseInstanceSchema,
  RawStudentCourseSchema,
  type StaffInstitution,
  StudentEnrollmentSchema,
} from '../../lib/client/safe-db-types.js';

import { EnrollmentCodeModal } from './EnrollmentCodeModal.js';
import { StudentCoursesCard } from './StudentCoursesCard.js';

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
  urlPrefix,
  isDevMode,
  enrollmentManagementEnabled,
}: {
  canAddCourses: boolean;
  csrfToken: string;
  instructorCourses: InstructorHomePageCourse[];
  studentCourses: StudentHomePageCourse[];
  adminInstitutions: StaffInstitution[];
  urlPrefix: string;
  isDevMode: boolean;
  enrollmentManagementEnabled: boolean;
}) {
  const listedStudentCourses = studentCourses.filter(
    (ci) => ci.enrollment.status === 'joined' || ci.enrollment.status === 'invited',
  );

  const hasCourses = listedStudentCourses.length > 0 || instructorCourses.length > 0;

  return (
    <>
      <h1 class="visually-hidden">PrairieLearn Homepage</h1>
      <div class="container pt-5">
        <DevModeCard isDevMode={isDevMode} />
        <AdminInstitutionsCard adminInstitutions={adminInstitutions} />
        {hasCourses ? (
          <>
            <InstructorCoursesCard instructorCourses={instructorCourses} urlPrefix={urlPrefix} />
            <Hydrate>
              <StudentCoursesCard
                studentCourses={listedStudentCourses}
                hasInstructorCourses={instructorCourses.length > 0}
                canAddCourses={canAddCourses}
                csrfToken={csrfToken}
                urlPrefix={urlPrefix}
                isDevMode={isDevMode}
                enrollmentManagementEnabled={enrollmentManagementEnabled}
              />
            </Hydrate>
          </>
        ) : (
          <Hydrate>
            <EmptyStateCards
              urlPrefix={urlPrefix}
              enrollmentManagementEnabled={enrollmentManagementEnabled}
            />
          </Hydrate>
        )}
      </div>
    </>
  );
}

function DevModeCard({ isDevMode }: { isDevMode: boolean }) {
  if (!isDevMode) return null;

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
  urlPrefix: string;
}

function InstructorCoursesCard({ instructorCourses, urlPrefix }: InstructorCoursesCardProps) {
  if (instructorCourses.length === 0) return null;

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>Courses with instructor access</h2>
        <a
          href="https://prairielearn.readthedocs.io/en/latest"
          class="btn btn-light btn-sm ms-auto"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="bi bi-journal-text me-1" aria-hidden="true" />
          <span class="d-none d-sm-inline">View docs</span>
        </a>
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
                    <a href={`${urlPrefix}/course/${course.id}`}>
                      {course.short_name}: {course.title}
                    </a>
                  ) : (
                    `${course.short_name}: ${course.title}`
                  )}
                </td>
                <td class="js-course-instance-list">
                  <CourseInstanceList
                    courseInstances={course.course_instances.filter((ci) => !ci.expired)}
                    urlPrefix={urlPrefix}
                  />
                  {course.course_instances.some((ci) => ci.expired) && (
                    <details>
                      <summary class="text-muted small">Older instances</summary>
                      <CourseInstanceList
                        courseInstances={course.course_instances.filter((ci) => ci.expired)}
                        urlPrefix={urlPrefix}
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
  urlPrefix: string;
}

function CourseInstanceList({ courseInstances, urlPrefix }: CourseInstanceListProps) {
  return (
    <div class="d-flex flex-wrap gap-2 my-1">
      {courseInstances.map((courseInstance) => (
        <a
          key={courseInstance.id}
          class="btn btn-outline-primary btn-sm"
          href={`${urlPrefix}/course_instance/${courseInstance.id}/instructor`}
        >
          {courseInstance.long_name}
        </a>
      ))}
    </div>
  );
}

function EmptyStateCards({
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
                    class="btn btn-primary d-flex gap-2 justify-content-center"
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
      <EnrollmentCodeModal show={show} onHide={() => setShow(false)} />
    </>
  );
}

EmptyStateCards.displayName = 'EmptyStateCards';
