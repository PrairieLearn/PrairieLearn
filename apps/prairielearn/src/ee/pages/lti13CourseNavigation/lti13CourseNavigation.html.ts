import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { config } from '../../../lib/config.js';
import { Course, CourseInstance } from '../../../lib/db-types.js';

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
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 - Course' })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          ...resLocals,
          navPage: 'lti13_course_navigation',
        })}
        <script>
          $(() => {
            $('#onepicker').one('change', () => {
              $('#saveButton').prop('disabled', false);
            });
          });
        </script>

        <div class="modal" tabindex="-1" role="dialog" id="PLterminology">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="exampleModalLabel">Understanding PrairieLearn</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <p>
                  PrairieLearn defines a <strong>course</strong> as a collection of questions and
                  course instances. It is the overarching umbrella that spans multiple runnings of
                  the course with students. Things that live across multiple semesters live at the
                  course level.
                </p>

                <p>
                  A <strong>course instance</strong> is the running of an edition of a course that
                  has assessments, enrollments, grades, etc. Like a semester or quarter.
                </p>

                <p class="font-italic">
                  Example: A course might be MATH 101 and have a course instance MATH 101 Fall 2023.
                </p>

                <p>
                  For more, see the
                  <a href="https://prairielearn.readthedocs.io/" target="_blank"
                    >PrairieLearn User Guide</a
                  >
                </p>
              </div>
            </div>
          </div>
        </div>

        <main class="container mb-4">
          <h1>Welcome to PrairieLearn</h1>
          <p>
            To finish the integration for your course, we need to connect
            <code>${courseName}</code> with a PrairieLearn course instance.
          </p>
          <p>
            <button
              type="button"
              class="btn btn-sm btn-info"
              data-toggle="modal"
              data-target="#PLterminology"
            >
              New here? Learn about our terminology
            </button>
          </p>

          <p>
            If you want this to connect to a <strong>new course</strong> or
            <strong>new course instance</strong>, you need to create those first and then return to
            this form.
          </p>
          <ul>
            <li>
              To create a new course, please <a href="/pl/request_course">request one here</a>.
            </li>
            <li>
              New course instances can be made from the "Course Instances" tab in an existing
              course.
            </li>
            <ul>
              <li>
                If you want to copy an existing course instance, you can do that from its Course
                Instance "Settings" tab.
              </li>
            </ul>
          </ul>

          ${courses.length === 0
            ? html`<p>
                It doesn't look like you have any PrairieLearn courses.
                <a href="/pl/request_course" class="btn btn-success">Go request a course</a>
              </p>`
            : html`
                <p>Your courses:</p>
                <ul>
                  ${courses.map((course) => {
                    return html` <li>
                      <a href="/pl/course/${course.id}">${course.short_name}: ${course.title}</a>
                    </li>`;
                  })}
                </ul>
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <label>Connect ${courseName} with:
                  <div class="input-group">
                    <select class="custom-select" id="onepicker" name="unsafe_course_instance_id">
                      <option value="" disabled selected>
                        Select an existing course instance...
                      </option>
                      ${courses.map((course) => {
                        const course_cis = course_instances.filter(
                          (ci) => ci.course_id === course.id,
                        );
                        return html`
                          <optgroup label="${course.short_name}: ${course.title}">
                            ${course_cis.map((ci) => {
                              return html`<option value="${ci.id}">
                                ${course.short_name} -- ${ci.long_name} (${ci.short_name})
                              </option>`;
                            })}
                          </optgroup>
                        `;
                      })}
                    </select>
                    </label>
                  </div>
                  <button class="btn btn-primary" id="saveButton" disabled>Save</button>
                </form>
              `}
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
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 - Course' })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          ...resLocals,
          navPage: 'lti13_course_navigation',
        })}
        <main class="container mb-4">
          <h1 class="h1">Welcome to PrairieLearn</h1>
          <h2 class="h2">... but your course isn't ready yet!</h2>

          <p>An instructor has not yet configured ${courseName} in PrairieLearn.</p>
          <p>Please come back later.</p>
          <a href="${config.urlPrefix}" class="btn btn-primary">
            <i class="fa fa-home" aria-hidden="true"></i>
            PrairieLearn home
          </a>
        </main>
      </body>
    </html>
  `.toString();
}

export function Lti13CourseNavigationDone({
  resLocals,
  lti13_instance_id,
}: {
  resLocals: Record<string, any>;
  lti13_instance_id: string;
}): string {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 - Course' })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          ...resLocals,
          navPage: 'lti13_course_navigation',
        })}
        <main class="container mb-4">
          <h1 class="h1">Welcome to PrairieLearn</h1>

          <p>
            <strong>You're all set.</strong> Next time you or students click on the link in your
            LMS, they will be taken directly to your PrairieLearn course instance.
          </p>
          <ul>
            <li>
              The course instance <code>allowAccess</code> rules still apply and may need to be
              configured.
            </li>
          </ul>

          <p>To change this connection, go to your course instance LTI 1.3 page.</p>

          <p>
            <a
              href="/pl/lti13_instance/${lti13_instance_id}/course_navigation"
              class="btn btn-success"
            >
              Continue to your course instance
            </a>
          </p>
        </main>
      </body>
    </html>
  `.toString();
}
