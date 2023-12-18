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

  console.log(courses);
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

          <p>
            To finish the LTI setup for your course, we need to connect ${courseName} with a
            PrairieLearn course instance.
          </p>

          <!-- 0 courses -->

          <!-- Note to create a new course instance -->
          <p>If you want this to connect to a <strong>new course</strong> or <strong>new course instance</strong>,
          you need to create those first and then return to this form.
          <ul>
            <li>If you're creating a new course, please <a href="/pl/request_course">request one here</a>.</li>
            <li>New course instances can be made from the course "Course Instances" tab.</li>
              <ul>
                <li>
                  If you want to copy an existing course instance, you can do that from the Course Instance Settings tab.
                </li>
              </ul>
          </ul>
          </p>

          <p>Your courses:</p>
          <ul>
            ${courses.map((course) => {
              return html`<li>
                <a href="/pl/course/${course.id}">${course.short_name}: ${course.title}</a>
              </li>`;
            })}
            <li>
              It doesn't look like you have any PrairieLearn courses.
              <a href="/pl/request_course" class="btn btn-primary">Go request a course</a>
            </li>
          </ul>

          <div class="input-group input-group-lg">
              <select class="custom-select" id="onepicker">
                <option value="" disabled selected>Select an existing course instance...</option>
                ${courses.map((course) => {
                  const course_cis = course_instances.filter((ci) => ci.course_id === course.id);
                  return html`
                    <optgroup label="${course.short_name}: ${course.title}">
                      ${course_cis.map((ci) => {
                        return html`<option value="${ci.id}">
                          ${ci.long_name} (${ci.short_name})
                        </option>`;
                      })}
                    </optgroup>
                  `;
                })}
              </select>
          </div>
          <button class="btn btn-primary btn-lg">Save</button>
        </main>
      </body>
    </html>
  `.toString();
}

/*
            <a class="btn btn-info" href="/pl/course/${course.id}/course_admin/instances">
            Create a new course instance in ${course.short_name}
  */

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
