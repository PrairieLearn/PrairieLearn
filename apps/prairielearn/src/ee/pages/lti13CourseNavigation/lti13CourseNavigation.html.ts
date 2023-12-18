import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { Course, CourseInstance } from '../../../lib/db-types';

//import { EncodedData } from '@prairielearn/browser-utils';
//import { compiledScriptTag } from '../../../lib/assets';

export function Lti13CourseNavigationInstructor({
  courseName,
  resLocals,
  courses,
  course_instances,
}: {
  courseName: string;
  resLocals: Record<string, any>;
  courses: Course[];
  course_instances: CourseInstance[];
}): string {

  /*

    0 courses with edit access, 0 course instances.
    1 course with edit access, N course instances.
    N courses

  */

  console.log(courses)
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

          <p>We know that you came from ${courseName} -- now we need to connect that course to
          a PrairieLearn course instance.
          </p>

          <p>${courses.length} courses with staff access.
          </p>
          <p>${course_instances.length} course instances.</p>

          <p><a class="btn btn-success" href="/pl/request_course">Request a new course</a>

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
