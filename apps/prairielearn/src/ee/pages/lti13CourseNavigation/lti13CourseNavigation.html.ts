import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { Course, CourseInstance } from '../../../lib/db-types';

//import { EncodedData } from '@prairielearn/browser-utils';
//import { compiledScriptTag } from '../../../lib/assets';

export function Lti13CourseNavigationInstructor({
  courseName,
  resLocals,
  courses_with_staff_access,
  course_instances,
}: {
  courseName: string;
  resLocals: Record<string, any>;
  courses_with_staff_access: Course[];
  course_instances: CourseInstance[];
}): string {

  console.log(course_instances);
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'lti13_course_naviation',
          pageTitle: 'Course',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar'); %>", {
          ...resLocals,
          navPage: 'lti13_course_navigation',
        })}
        <main class="container mb-4">
          <h1 class="h1">Welcome to PrairieLearn</h1>

          <p>${courses_with_staff_access.length} courses with staff access.</p>
          <p>${course_instances.length} course instances.</p>
        </main>
      </body>
    </html>

  `.toString();
}


export function Lti13CourseNavigationNotReady({
  courseName,
  resLocals,
}: {
  courseName: string;
  resLocals: Record<string, any>;
}): string {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'lti13_course_naviation',
          pageTitle: 'Course',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar'); %>", {
          ...resLocals,
          navPage: 'lti13_course_navigation',
        })}
        <main class="container mb-4">
          <h1 class="h1">Welcome to PrairieLearn</h1>
          <h2 class="h2">... but your course isn't ready yet!</h2>

          <p>An instructor has not yet configured ${courseName} in PrairieLearn.</p>
          <p>Please come back later.</p>
        </main>
      </body>
    </html>
  `.toString();
}
