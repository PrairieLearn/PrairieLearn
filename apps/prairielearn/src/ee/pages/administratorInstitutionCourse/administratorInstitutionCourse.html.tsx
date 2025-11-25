import { z } from 'zod';

import {
  type AdminCourse,
  type AdminInstitution,
  StaffCourseInstanceSchema,
} from '../../../lib/client/safe-db-types.js';

export const SafeCourseInstanceRowSchema = z.object({
  course_instance: StaffCourseInstanceSchema,
  enrollment_count: z.number(),
});
type SafeCourseInstanceRow = z.infer<typeof SafeCourseInstanceRowSchema>;

export function AdministratorInstitutionCourse({
  institution,
  course,
  rows,
  csrfToken,
}: {
  institution: AdminInstitution;
  course: AdminCourse;
  rows: SafeCourseInstanceRow[];
  csrfToken: string;
}) {
  return (
    <>
      <p>
        <a href={`/pl/course/${course.id}`}>View as instructor</a>
      </p>

      <h2 class="h4">Limits</h2>
      <form method="POST" class="mb-3">
        <div class="mb-3">
          <label class="form-label" for="institution_course_instance_enrollment_limit">
            Course instance enrollment limit for institution
          </label>
          <input
            type="number"
            class="form-control"
            id="institution_course_instance_enrollment_limit"
            value={institution.course_instance_enrollment_limit}
            disabled
          />
          <small class="form-text text-muted">
            This limit applies to all course instances without a specific enrollment limit set.
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="institution_yearly_enrollment_limit">
            Yearly enrollment limit for institution
          </label>
          <input
            type="number"
            class="form-control"
            id="institution_yearly_enrollment_limit"
            value={institution.yearly_enrollment_limit}
            disabled
          />
          <small class="form-text text-muted">
            This limit applies to all enrollments in this course's institution.
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="course_instance_enrollment_limit">
            Course instance enrollment limit override
          </label>
          <input
            type="number"
            class="form-control"
            id="course_instance_enrollment_limit"
            name="course_instance_enrollment_limit"
            value={course.course_instance_enrollment_limit ?? ''}
          />
          <small class="form-text text-muted">
            This limit will apply to all course instances in this course. If no override is set, the
            institution-wide limit will be used.
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="yearly_enrollment_limit">
            Yearly enrollment limit for course
          </label>
          <input
            type="number"
            class="form-control"
            id="yearly_enrollment_limit"
            name="yearly_enrollment_limit"
            value={course.yearly_enrollment_limit ?? ''}
          />
          <small class="form-text text-muted">
            This limit applies only to this course. It is applied
            <i>
              <strong>in addition to</strong>
            </i>{' '}
            the institution-wide yearly enrollment limit.
          </small>
        </div>

        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <button
          type="submit"
          name="__action"
          value="update_enrollment_limits"
          class="btn btn-primary"
        >
          Save
        </button>
      </form>

      <h2 class="h4">Course instances</h2>
      <div class="table-responsive">
        <table class="table table-hover table-striped table-bordered" aria-label="Course instances">
          <thead>
            <tr>
              <th>Name</th>
              <th>Enrollments</th>
              <th>Effective enrollment limit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ course_instance, enrollment_count }) => {
              return (
                <tr key={course_instance.id}>
                  <td>
                    <a
                      href={`/pl/administrator/institution/${institution.id}/course_instance/${course_instance.id}`}
                    >
                      {course_instance.short_name ?? '—'}: {course_instance.long_name ?? '—'}
                    </a>
                  </td>
                  <td>{enrollment_count}</td>
                  <td>
                    {course_instance.enrollment_limit ??
                      course.course_instance_enrollment_limit ??
                      institution.course_instance_enrollment_limit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
