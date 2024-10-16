import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { type HtmlValue, html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type CourseRequest, CourseRequestSchema, UserSchema } from '../../lib/db-types.js';

export const CourseRequestRowSchema = z.object({
  course_request: CourseRequestSchema,
  approved_by_user: UserSchema.nullable(),
});
type CourseRequestRow = z.infer<typeof CourseRequestRowSchema>;

export const Lti13CourseRequestInputSchema = z
  .object({
    'cr-firstname': z.string(),
    'cr-lastname': z.string(),
    'cr-email': z.string(),
    'cr-shortname': z.string(),
    'cr-title': z.string(),
    'cr-institution': z.string(),
  })
  .nullable();
export type Lti13CourseRequestInput = z.infer<typeof Lti13CourseRequestInputSchema>;

export function RequestCourse({
  rows,
  lti13Info,
  resLocals,
}: {
  rows: CourseRequestRow[];
  lti13Info: Lti13CourseRequestInput;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Request a Course' })}
        ${compiledScriptTag('instructorRequestCourseClient.ts')}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'request_course' })}
        <main id="content" class="container">
          <h1 class="sr-only">Request a Course</h1>
          ${CourseRequestsCard({ rows })} ${EncodedData(lti13Info, 'course-request-lti13-info')}
          ${Modal({
            id: 'fill-course-request-lti13-modal',
            title: `Auto-fill with ${lti13Info?.['cr-institution'] ?? 'LMS'} data?`,
            body: html`
              <p>
                You appear to be coming from a course in another learning system. Should we
                partially fill in this request form with information from that course?
              </p>
              <p>(You can edit it after it's auto-filled.)</p>
            `,
            footer: html`
              <button type="button" class="btn btn-success" id="fill-course-request-lti13-info">
                Fill from LMS data
              </button>
              <button type="button" class="btn btn-secondary" data-dismiss="modal">
                Don't fill
              </button>
            `,
          })}
          ${CourseNewRequestCard({ csrfToken: resLocals.__csrf_token })}
        </main>
      </body>
    </html>
  `.toString();
}

function CourseRequestsCard({ rows }: { rows: CourseRequestRow[] }): HtmlValue {
  if (rows.length === 0) {
    return '';
  }

  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>Course Requests</h2>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover table-striped" aria-label="Course requests">
          <thead>
            <tr>
              <th>Short Name</th>
              <th>Title</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ course_request, approved_by_user }) => {
              let details = '';
              switch (course_request.approved_status) {
                case 'approved':
                  if (approved_by_user) {
                    details = `Approved by ${approved_by_user.name}`;
                  } else {
                    details = 'Automatically approved';
                  }
                  break;
                case 'denied':
                  details = `Denied by ${approved_by_user?.name ?? 'unknown'}`;
                  break;
              }

              return html`
                <tr>
                  <td>${course_request.short_name}</td>
                  <td>${course_request.title}</td>
                  <td>${ApprovalStatusIcon({ status: course_request.approved_status })}</td>
                  <td>${details}</td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function CourseNewRequestCard({ csrfToken }: { csrfToken: string }): HtmlValue {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>Request a New Course</h2>
      </div>
      <form class="question-form" name="course-request" method="POST">
        <div class="card-body">
          <p>
            This form is for instructors who want to create a new course on PrairieLearn. Students
            should <strong>not</strong> submit this form and should instead use the "Enroll course"
            button on the PrairieLearn homepage. Teaching assistants and course staff are granted
            access by the owner of their course and should <strong>not</strong> submit this form.
          </p>

          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="cr-firstname">First name</label>
              <input
                type="text"
                class="form-control"
                name="cr-firstname"
                id="cr-firstname"
                minlength="1"
                required
              />
            </div>
            <div class="form-group col-md-6">
              <label for="cr-lastname">Last name</label>
              <input
                type="text"
                class="form-control"
                name="cr-lastname"
                id="cr-lastname"
                minlength="1"
                required
              />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="cr-institution">Institution</label>
              <input
                type="text"
                class="form-control"
                name="cr-institution"
                id="cr-institution"
                minlength="1"
                required
              />
              <small class="form-text text-muted">
                This is your academic institution (e.g., "University of Illinois").
              </small>
            </div>
            <div class="form-group col-md-6">
              <label for="cr-email">Email</label>
              <input
                type="email"
                class="form-control"
                name="cr-email"
                id="cr-email"
                placeholder="login@yourinstitution.edu"
                minlength="1"
                required
              />
              <small class="form-text text-muted"> Use your official work email address. </small>
            </div>
          </div>
          <div class="form-group">
            <label for="cr-shortname">Course Rubric and Number</label>
            <input
              type="text"
              class="form-control"
              name="cr-shortname"
              id="cr-shortname"
              placeholder="MATH 101"
              pattern="[a-zA-Z]+ [a-zA-Z0-9]+"
              title="this is a series of letters, followed by a space, followed by a series of numbers and/or letters"
              required
            />
            <small class="form-text text-muted"> Examples: MATH 101, PHYS 440. </small>
          </div>
          <div class="form-group">
            <label for="cr-title">Course Title</label>
            <input
              type="text"
              class="form-control"
              name="cr-title"
              id="cr-title"
              placeholder="Elementary Mathematics"
              minlength="1"
              required
            />
            <small class="form-text text-muted">
              This is the official title of the course, as given in the course catalog.
            </small>
          </div>
          <div class="form-group">
            <label for="cr-ghuser">GitHub Username (optional)</label>
            <input type="text" class="form-control" name="cr-ghuser" id="cr-ghuser" />
            <small class="form-text text-muted">
              Providing your GitHub username will allow you to edit course content offline. You do
              not need to provide this if you would like to use the online web editor.
            </small>
          </div>
          <div class="form-group">
            <label id="cr-referral-source-label" for="cr-referral-source">
              How did you hear about PrairieLearn?
            </label>
            <select
              class="custom-select"
              name="cr-referral-source"
              id="cr-referral-source"
              aria-labelledby="cr-referral-source-label"
              required
            >
              <option value="" disabled selected></option>
              <option value="I've used PrairieLearn before">I've used PrairieLearn before</option>
              <option value="Word of mouth">Word of mouth</option>
              <option value="Web search">Web search</option>
              <option value="Conference or workshop">Conference or workshop</option>
              <option value="Publication">Publication</option>
              <option value="other">Other...</option>
            </select>
            <input
              type="text"
              class="form-control mt-2 d-none"
              name="cr-referral-source-other"
              id="cr-referral-source-other"
              aria-labelledby="cr-referral-source-label"
            />
            <small class="form-text text-muted">
              This information helps us understand how people find out about PrairieLearn. Thank you
              for sharing!
            </small>
          </div>
          <div class="form-group">
            <label for="role-instructor">Your Role in the Course</label>
            <ul class="list-group">
              <li class="list-group-item">
                <input type="radio" id="role-instructor" name="cr-role" value="instructor" />
                <label for="role-instructor" class="mb-0">Official Course Instructor</label>
              </li>
              <li class="list-group-item">
                <input type="radio" id="role-ta" name="cr-role" value="ta" />
                <label for="role-ta" class="mb-0">Teaching Assistant or other course staff</label>
              </li>
              <li class="list-group-item">
                <input type="radio" id="role-admin" name="cr-role" value="admin" />
                <label for="role-admin" class="mb-0">Institution Administrative Staff</label>
              </li>
              <li class="list-group-item">
                <input type="radio" id="role-student" name="cr-role" value="student" />
                <label for="role-student" class="mb-0">Student</label>
              </li>
            </ul>
            <div
              style="display: none;"
              class="role-comment role-comment-ta role-comment-admin form-text card"
            >
              <p class="card-body">
                <b>A new course instance must be requested by the instructor.</b> Please ask the
                official course instructor to submit this form.
              </p>
            </div>
            <div style="display: none;" class="role-comment role-comment-student form-text card">
              <p class="card-body">
                <b>This is the wrong form for you.</b> If you would like to enroll in an existing
                course, please use the <a href="enroll">form to Enroll in a course</a>. If your
                course is not listed there, contact your instructor for instructions on how to
                access your assessments.
              </p>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <button class="btn btn-primary" type="submit" disabled>Submit Request</button>
        </div>
      </form>
    </div>
  `;
}

function ApprovalStatusIcon({ status }: { status: CourseRequest['approved_status'] }) {
  if (status === 'pending' || status === 'creating' || status === 'failed') {
    return html`<span class="badge badge-secondary"> <i class="fa fa-clock"></i> Pending</span>`;
  } else if (status === 'approved') {
    return html`<span class="badge badge-success"> <i class="fa fa-check"></i> Approved</span>`;
  } else if (status === 'denied') {
    return html`<span class="badge badge-danger"><i class="fa fa-times"></i> Denied</span>`;
  }
}
