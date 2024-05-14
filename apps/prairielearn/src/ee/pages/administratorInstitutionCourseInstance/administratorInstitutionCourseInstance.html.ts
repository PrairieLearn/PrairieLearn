import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import {
  type Course,
  type CourseInstance,
  type Institution,
  type PlanGrant,
} from '../../../lib/db-types.js';
import { PlanGrantsEditor } from '../../lib/billing/components/PlanGrantsEditor.html.js';
import { compiledScriptTag } from '../../../lib/assets.js';

export function AdministratorInstitutionCourseInstance({
  institution,
  course,
  course_instance,
  planGrants,
  resLocals,
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  planGrants: PlanGrant[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'administrator_institution',
          pageTitle: 'Courses',
        })}
        ${compiledScriptTag('administratorInstitutionCourseInstanceClient.ts')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'administrator_institution',
          navPage: 'administrator_institution',
          navSubPage: 'courses',
        })}
        <nav class="container" aria-label="Breadcrumbs">
          <ol class="breadcrumb">
            <li class="breadcrumb-item">
              <a href="/pl/administrator/institution/${institution.id}/courses">Courses</a>
            </li>
            <li class="breadcrumb-item">
              <a href="/pl/administrator/institution/${institution.id}/course/${course.id}">
                ${course.short_name}: ${course.title}
              </a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              ${course_instance.short_name ?? '—'}: ${course_instance.long_name ?? '—'}
            </li>
          </ol>
        </nav>
        <main class="container mb-4">
          <h2 class="h4">Limits</h2>
          <form method="POST" class="mb-3">
            <div class="form-group">
              <label for="course_instance_enrollment_limit_from_institution">
                Enrollment limit from institution
              </label>
              <input
                type="number"
                disabled
                class="form-control"
                id="course_instance_enrollment_limit_from_institution"
                value="${institution.course_instance_enrollment_limit}"
              />
              <small class="form-text text-muted">
                This limit applies to all course instances without a specific enrollment limit set.
              </small>
            </div>

            <div class="form-group">
              <label for="course_instance_enrollment_limit_from_course">
                Enrollment limit from course
              </label>
              <input
                type="number"
                disabled
                class="form-control"
                id="course_instance_enrollment_limit_from_course"
                value="${course.course_instance_enrollment_limit}"
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
                This limit overrides any course-wide or institution-wide limits. If no override is
                set, the enrollment limit from either the course or the institution (if any) will be
                used.
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

          <h2 class="h4">Plans</h2>
          ${PlanGrantsEditor({
            planGrants,
            // The basic plan is never available at the course instance level; it's only
            // used for student billing for enrollments.
            excludedPlanNames: ['basic'],
            csrfToken: resLocals.__csrf_token,
          })}
        </main>
      </body>
    </html>
  `.toString();
}
