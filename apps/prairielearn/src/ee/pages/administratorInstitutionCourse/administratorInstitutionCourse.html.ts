import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { type Institution, type Course, CourseInstanceSchema } from '../../../lib/db-types.js';

export const CourseInstanceRowSchema = z.object({
  course_instance: CourseInstanceSchema,
  enrollment_count: z.number(),
});
type CourseInstanceRow = z.infer<typeof CourseInstanceRowSchema>;

export function AdministratorInstitutionCourse({
  institution,
  course,
  rows,
  resLocals,
}: {
  institution: Institution;
  course: Course;
  rows: CourseInstanceRow[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({
          resLocals,
          pageTitle: `${course.short_name} - Institution Admin`,
        })}
      </head>
      <body>
        ${Navbar({
          resLocals: { ...resLocals, institution },
          navbarType: 'administrator_institution',
          navPage: 'administrator_institution',
          navSubPage: 'courses',
        })}
        <nav class="container" aria-label="Breadcrumbs">
          <ol class="breadcrumb">
            <li class="breadcrumb-item">
              <a href="/pl/administrator/institution/${institution.id}/courses">Courses</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              ${course.short_name}: ${course.title}
            </li>
          </ol>
        </nav>
        <main id="content" class="container mb-4">
          <p><a href="/pl/course/${course.id}">View as instructor</a></p>

          <h2 class="h4">Limits</h2>
          <form method="POST" class="mb-3">
            <div class="form-group">
              <label for="institution_course_instance_enrollment_limit">
                Course instance enrollment limit for institution
              </label>
              <input
                type="number"
                disabled
                class="form-control"
                id="institution_course_instance_enrollment_limit"
                value="${institution.course_instance_enrollment_limit}"
              />
              <small class="form-text text-muted">
                This limit applies to all course instances without a specific enrollment limit set.
              </small>
            </div>

            <div class="form-group">
              <label for="institution_yearly_enrollment_limit">
                Yearly enrollment limit for institution
              </label>
              <input
                type="number"
                disabled
                class="form-control"
                id="institution_yearly_enrollment_limit"
                value="${institution.yearly_enrollment_limit}"
              />
              <small class="form-text text-muted">
                This limit applies to all enrollments in this course's institution.
              </small>
            </div>

            <div class="form-group">
              <label for="course_instance_enrollment_limit">
                Course instance enrollment limit override
              </label>
              <input
                type="number"
                class="form-control"
                id="course_instance_enrollment_limit"
                name="course_instance_enrollment_limit"
                value="${course.course_instance_enrollment_limit}"
              />
              <small class="form-text text-muted">
                This limit will apply to all course instances in this course. If no override is set,
                the institution-wide limit will be used.
              </small>
            </div>

            <div class="form-group">
              <label for="yearly_enrollment_limit">Yearly enrollment limit for course</label>
              <input
                type="number"
                class="form-control"
                id="yearly_enrollment_limit"
                name="yearly_enrollment_limit"
                value="${course.yearly_enrollment_limit}"
              />
              <small class="form-text text-muted">
                This limit applies only to this course. It is applied
                <i><strong>in addition to</strong></i> the institution-wide yearly enrollment limit.
              </small>
            </div>

            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
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
            <table
              class="table table-hover table-striped table-bordered table"
              aria-label="Course instances"
            >
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Enrollments</th>
                  <th>Effective enrollment limit</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(({ course_instance, enrollment_count }) => {
                  return html`
                    <tr>
                      <td>
                        <a
                          href="/pl/administrator/institution/${institution.id}/course_instance/${course_instance.id}"
                        >
                          ${course_instance.short_name ?? '—'}: ${course_instance.long_name ?? '—'}
                        </a>
                      </td>
                      <td>${enrollment_count}</td>
                      <td>
                        ${course_instance.enrollment_limit ??
                        course.course_instance_enrollment_limit ??
                        institution.course_instance_enrollment_limit}
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
