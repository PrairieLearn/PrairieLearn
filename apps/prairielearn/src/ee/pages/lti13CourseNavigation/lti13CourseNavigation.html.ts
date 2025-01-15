import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { config } from '../../../lib/config.js';
import { type Course } from '../../../lib/db-types.js';

export function Lti13CourseNavigationInstructor({
  courseName,
  resLocals,
  courses,
  originalUrl,
}: {
  courseName: string;
  resLocals: Record<string, any>;
  courses: Course[];
  originalUrl: string;
}): string {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 - Course' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'lti13_course_navigation' })} ${TerminologyModal()}
        <script>
          $(() => {
            $('#connect_course_instance').one('change', () => {
              $('#saveButton').prop('disabled', false);
            });
          });
        </script>

        <main id="content" class="container mb-4">
          <h1>Welcome to PrairieLearn</h1>
          <p>
            To finish the integration for your course, we need to connect
            <code>${courseName}</code> with a PrairieLearn course instance.
          </p>
          <p>
            <button
              type="button"
              class="btn btn-sm btn-info"
              data-bs-toggle="modal"
              data-bs-target="#terminology-modal"
            >
              New here? Learn about our terminology
            </button>
          </p>

          ${courses.length === 0
            ? html`<p>
                <strong>
                  It doesn't look like you have owner permissions in any PrairieLearn courses.
                </strong>
              </p>`
            : html`
                <div class="mb-3">
                  <form method="POST" id="ci_form">
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />

                    <label class="form-label" for="connect_course">
                      Connect ${courseName} with PrairieLearn course:
                    </label>
                    <select
                      id="connect_course"
                      class="form-select mb-3"
                      name="unsafe_course_id"
                      hx-get="${originalUrl}/course_instances"
                      hx-include="#ci_form"
                      hx-target="#course_instances"
                    >
                      <option selected disabled>Select a course to continue</option>
                      ${courses.map((c) => {
                        return html`<option value="${c.id}">${c.short_name}: ${c.title}</option>`;
                      })}
                    </select>
                    <label class="form-label" for="course_instances">
                      Select a course instance to link:
                    </label>
                    <select
                      id="course_instances"
                      name="unsafe_course_instance_id"
                      class="form-select mb-3"
                    >
                      <option selected disabled>See above</option>
                    </select>
                    <input type="submit" class="btn btn-primary" value="Save" />
                  </form>
                </div>
              `}

          <p>
            <details>
              <summary>Why don't I see my course or course instances here?</summary>
              <p>The following PrairieLearn permissions are required to link:</p>
              <ul>
                <li>Course: Owner</li>
                <li>Course instance: Any</li>
              </ul>
            </details>
          </p>
          <p>
            If you need a new PrairieLearn course,
            <a href="/pl/request_course">request one here</a>.
          </p>

          <p>
            If you need a new course instance, create one in PrairieLearn first then revisit this
            course linking flow.
          </p>
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
        ${Navbar({ resLocals, navPage: 'lti13_course_navigation' })}
        <main id="content" class="container mb-4">
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
        ${Navbar({ resLocals, navPage: 'lti13_course_navigation' })}
        <main id="content" class="container mb-4">
          <h1 class="h1">Welcome to PrairieLearn</h1>

          <p>
            <strong>You're all set.</strong> Next time you or students click on the link in your
            LMS, they will be taken directly to your PrairieLearn course instance.
          </p>

          <div class="alert alert-warning">
            The course instance and assessment <code>allowAccess</code> rules still apply and may
            need to be configured.
          </div>

          <p>To change this connection, go to your course instance LTI 1.3 page.</p>

          <p>
            <a
              href="/pl/lti13_instance/${lti13_instance_id}/course_navigation"
              class="btn btn-primary"
            >
              Continue to your course instance
            </a>
          </p>
        </main>
      </body>
    </html>
  `.toString();
}

function TerminologyModal() {
  return Modal({
    id: 'terminology-modal',
    title: 'Understanding PrairieLearn',
    body: html`
      <p>
        PrairieLearn defines a <strong>course</strong> as a collection of questions and course
        instances. It is the overarching umbrella that spans multiple runnings of the course with
        students. Things that live across multiple semesters live at the course level.
      </p>

      <p>
        A <strong>course instance</strong> is the running of an edition of a course that has
        assessments, enrollments, grades, etc. Like a semester or quarter.
      </p>

      <p class="fst-italic">
        Example: A course might be MATH 101 and have a course instance MATH 101 Fall 2023.
      </p>

      <p>
        For more, see the
        <a href="https://prairielearn.readthedocs.io/" target="_blank">PrairieLearn User Guide</a>
      </p>
    `,
  });
}
