import { html } from '@prairielearn/html';

import { Modal } from '../../../components/Modal.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { type Course } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { STUDENT_ROLE } from '../../lib/lti13.js';

export function Lti13CourseNavigationInstructor({
  courseName,
  resLocals,
  courses,
  lti13_instance_id,
}: {
  courseName: string;
  resLocals: ResLocalsForPage<'plain'>;
  courses: Course[];
  lti13_instance_id: string;
}): string {
  return PageLayout({
    resLocals,
    pageTitle: 'LTI 1.3 - Course',
    navContext: { type: 'plain', page: 'lti13_course_navigation' },
    content: html`
      ${TerminologyModal()}
      <h1>Welcome to PrairieLearn</h1>
      <p>
        To finish the integration for your course, you need to connect
        <strong>${courseName}</strong> with a PrairieLearn course instance.
      </p>

      ${courses.length === 0
        ? html`<p>
            <strong>
              You don't have course owner or editor permissions in any PrairieLearn courses.
            </strong>
          </p>`
        : html`
            <div class="mb-3">
              <form method="POST" id="link_form">
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />

                <label class="form-label" for="connect_course">
                  Select a PrairieLearn course:
                </label>
                <select
                  id="connect_course"
                  class="form-select mb-3"
                  name="unsafe_course_id"
                  hx-get="/pl/lti13_instance/${lti13_instance_id}/course_navigation/course_instances"
                  hx-include="#link_form"
                  hx-target="#course_instances"
                  required
                >
                  <option selected disabled value="">Select a course to continue</option>
                  ${courses.map((c) => {
                    return html`<option value="${c.id}">${c.short_name}: ${c.title}</option>`;
                  })}
                </select>
                <label class="form-label" for="course_instances">
                  Select a course instance to connect:
                </label>
                <select
                  id="course_instances"
                  name="unsafe_course_instance_id"
                  class="form-select mb-3"
                  required
                >
                  <option selected disabled value="">See above</option>
                </select>
                <button type="submit" class="btn btn-primary">Connect course instance</button>
              </form>
            </div>
          `}

      <p>
        <details>
          <summary>Why don't I see my course or course instances here?</summary>
          <p>
            You must have PrairieLearn course <strong>Editor</strong> and course instance
            <strong>Student Data Editor</strong> permissions to link a course.
          </p>
        </details>
      </p>
      <p>
        If you need a new PrairieLearn course,
        <a href="/pl/request_course">request one here</a>.
      </p>

      <p>
        If you need a new course instance, create one in PrairieLearn first then revisit this course
        linking flow.
      </p>
      <button
        type="button"
        class="btn btn-link"
        data-bs-toggle="modal"
        data-bs-target="#terminology-modal"
      >
        New here? Learn about PrairieLearn terminology
      </button>
    `,
  });
}

export function Lti13CourseNavigationNotReady({
  courseName,
  resLocals,
  ltiRoles,
}: {
  courseName: string;
  resLocals: ResLocalsForPage<'plain'>;
  ltiRoles: string[];
}): string {
  return PageLayout({
    resLocals,
    pageTitle: 'LTI 1.3 - Course',
    navContext: { type: 'student', page: 'lti13_course_navigation' },
    content: html`
      <h1 class="h1">Welcome to PrairieLearn</h1>
      <h2 class="h2">... but your course isn't ready yet!</h2>

      <p>An instructor has not yet configured ${courseName} in PrairieLearn.</p>
      <p>Please come back later.</p>
      <p>
        <a href="/pl" class="btn btn-primary">
          <i class="fa fa-home" aria-hidden="true"></i>
          PrairieLearn home
        </a>
      </p>
      ${ltiRoles.includes(STUDENT_ROLE)
        ? ''
        : html`
            <div class="card">
              <div class="card-header bg-info">Debugging information</div>
              <div class="card-body">
                <p>
                  You do not have the permissions to integrate PrairieLearn course instances. An
                  instructor or designer (and not Teaching Assistant) LMS role is needed to do this.
                </p>
                <p>Here are your roles that we received from your LMS:</p>
                <ul class="mb-0">
                  ${ltiRoles.map((role) => html`<li><code>${role}</code></li>`)}
                </ul>
              </div>
            </div>
          `}
    `,
  });
}

export function Lti13CourseNavigationDone({
  resLocals,
  lti13_instance_id,
}: {
  resLocals: ResLocalsForPage<'plain'>;
  lti13_instance_id: string;
}): string {
  return PageLayout({
    resLocals,
    pageTitle: 'LTI 1.3 - Course',
    navContext: { type: 'plain', page: 'lti13_course_navigation' },
    content: html`
      <h1 class="h1">Welcome to PrairieLearn</h1>

      <p>
        <strong>You're all set.</strong> Next time you or students click on the link in your LMS,
        they will be taken directly to your PrairieLearn course instance.
      </p>

      <div class="alert alert-warning">
        The course instance and assessment <code>allowAccess</code> rules still apply and may need
        to be configured.
      </div>

      <p>To change this connection, go to your course instance LTI 1.3 page.</p>

      <p>
        <a href="/pl/lti13_instance/${lti13_instance_id}/course_navigation" class="btn btn-primary">
          Continue to your course instance
        </a>
      </p>
    `,
  });
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
        <a href="https://docs.prairielearn.com/" target="_blank" rel="noreferrer"
          >PrairieLearn User Guide</a
        >
      </p>
    `,
  });
}
