import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { Course, type CourseInstance, type Institution } from '../../../lib/db-types';

export function InstitutionAdminCourseInstance({
  institution,
  course,
  course_instance,
  resLocals,
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'Courses',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'courses',
        })}
        <nav class="container" aria-label="Breadcrumbs">
          <ol class="breadcrumb">
            <li class="breadcrumb-item">
              <a href="/pl/institution/${institution.id}/admin/courses">Courses</a>
            </li>
            <li class="breadcrumb-item">
              <a href="/pl/institution/${institution.id}/admin/course/${course.id}">
                ${course.title} (${course.short_name})
              </a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              ${course_instance.long_name} (${course_instance.short_name})
            </li>
          </ol>
        </nav>
        <main class="container mb-4">
          <h2 class="h4 mb-4">Limits</h2>
          <form method="POST">
            <div class="form-group">
              <label for="institution_course_instance_enrollment_limit">
                Enrollment limit for institution
              </label>
              <input
                type="number"
                disabled
                class="form-control"
                id="institution_course_instance_enrollment_limit"
                name="institution_course_instance_enrollment_limit"
                value="${institution.course_instance_enrollment_limit}"
              />
              <small class="form-text text-muted">
                This limit applies to all course instances without a specific enrollment limit set.
              </small>
            </div>
            <div class="form-group">
              <label for="enrollment_limit">Enrollment limit override</label>
              <input
                type="number"
                class="form-control"
                id="enrollment_limit"
                name="enrollment_limit"
                value="${course_instance.enrollment_limit}"
              />
              <small class="form-text text-muted">
                This limit overrides the institution-wide limit. If no override is set, the
                institution course instance enrollment limit (if any) will be used.
              </small>
            </div>
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button
              type="submit"
              name="__action"
              value="update_enrollment_limit"
              class="btn btn-primary"
            >
              Save
            </button>
          </form>
        </main>
      </body>
    </html>
  `.toString();
}
