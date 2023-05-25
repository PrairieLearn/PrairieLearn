import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { Course, type CourseInstance, type Institution } from '../../../lib/db-types';

export function InstitutionAdminCourseInstance({
  institution,
  course,
  courseInstance,
  resLocals,
}: {
  institution: Institution;
  course: Course;
  courseInstance: CourseInstance;
  resLocals: Record<string, any>;
}) {
  return html`
    <!DOCTYPE html>
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
              ${courseInstance.long_name} (${courseInstance.short_name})
            </li>
          </ol>
        </nav>
        <main class="container mb-4"></main>
      </body>
    </html>
  `.toString();
}
