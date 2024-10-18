import { z } from 'zod';

import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';

export const CourseInstanceRowSchema = z.object({
  label: z.string(),
  short_label: z.string(),
  course_instance_id: z.string(),
  enrolled: z.boolean(),
  instructor_access: z.boolean(),
});
type CourseInstance = z.infer<typeof CourseInstanceRowSchema>;

export function Enroll({
  courseInstances,
  resLocals,
}: {
  courseInstances: CourseInstance[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${[
          HeadContents({ resLocals, pageTitle: 'Enrollment - Courses' }),
          compiledScriptTag('enrollClient.ts'),
        ]}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'enroll' })}
        ${AddCourseModal({ csrfToken: resLocals.__csrf_token })}
        ${RemoveCourseModal({ csrfToken: resLocals.__csrf_token })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Courses</h1>
            </div>
            <table class="table table-sm table-hover table-striped" aria-label="Courses">
              <tbody>
                ${courseInstances.map((course_instance) => {
                  return html`
                    <tr>
                      <td class="align-middle">${course_instance.label}</td>
                      ${course_instance.instructor_access
                        ? html`
                            <td class="align-middle text-center" colspan="2">
                              <span class="badge badge-info">instructor access</span>
                            </td>
                          `
                        : html`
                            <td>
                              ${!course_instance.enrolled
                                ? html`
                                    <button
                                      type="button"
                                      class="btn btn-sm btn-info"
                                      data-toggle="modal"
                                      data-target="#add-course-modal"
                                      data-course-instance-id="${course_instance.course_instance_id}"
                                      data-course-instance-short-label="${course_instance.short_label}"
                                    >
                                      Add course
                                    </button>
                                  `
                                : ''}
                            </td>
                            <td>
                              ${course_instance.enrolled
                                ? html`
                                    <button
                                      type="button"
                                      class="btn btn-sm btn-danger"
                                      data-toggle="modal"
                                      data-target="#remove-course-modal"
                                      data-course-instance-id="${course_instance.course_instance_id}"
                                      data-course-instance-short-label="${course_instance.short_label}"
                                    >
                                      Remove course
                                    </button>
                                  `
                                : ''}
                            </td>
                          `}
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

export function EnrollLtiMessage({
  ltiInfo,
  resLocals,
}: {
  ltiInfo: any;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Enrollment - Courses' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'enroll' })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              Logout and log back in to see more courses
            </div>
            <div class="card-body">
              <p>
                Your PrairieLearn login is currently tied to
                <strong>${ltiInfo.plc_short_name} ${ltiInfo.ci_long_name}</strong> and cannot be
                used to enroll in other courses.
              </p>
              <p>To see more courses:</p>
              <ol>
                <li>
                  Log out by selecting your name in the top right menu and selecting "Log out".
                </li>
                <li>Sign-in again with your normal login.</li>
                <li>Return to this enroll page to see the list of courses.</li>
              </ol>
              <p>
                Note: When you revisit the main ${ltiInfo.plc_short_name} course site and come back
                to PrairieLearn from it, it will take over your login again. You might consider
                using different web browsers for that course from your other PrairieLearn courses.
              </p>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

export function EnrollmentLimitExceededMessage({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Enrollment - Courses' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'enroll' })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-danger text-white">Enrollment limit exceeded</div>
            <div class="card-body">
              This course has reached its enrollment limit. Please contact the course staff for more
              information.
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function AddCourseModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'add-course-modal',
    title: 'Confirm add course',
    body: html`
      <p>Are you sure you want to add this course content to your PrairieLearn account?</p>
      <p>
        Adding or removing courses here only affects what is visible to you on PrairieLearn. This
        does not change your university course registration.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="course_instance_id" class="js-course-instance-id" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-info" name="__action" value="enroll">
        Add <span class="js-course-instance-short-label"></span>
      </button>
    `,
  });
}

function RemoveCourseModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'remove-course-modal',
    title: 'Confirm remove course',
    body: html`
      <p>Are you sure you want to remove this course content from your PrairieLearn account?</p>
      <p>
        Adding or removing courses here only affects what is visible to you on PrairieLearn. This
        does not change your university course registration.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="course_instance_id" class="js-course-instance-id" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger" name="__action" value="unenroll">
        Remove <span class="js-course-instance-short-label"></span>
      </button>
    `,
  });
}
