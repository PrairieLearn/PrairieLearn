import { HtmlValue, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';
import { CourseRequestSchema, UserSchema } from '../../lib/db-types';

export const CourseRequestRowSchema = z.object({
  course_request: CourseRequestSchema,
  approved_by_user: UserSchema.nullable(),
});
type CourseRequestRow = z.infer<typeof CourseRequestRowSchema>;

export function RequestCourse({
  rows,
  resLocals,
}: {
  rows: CourseRequestRow[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head')%>", {
          ...resLocals,
        })}
        <script>
          $(function () {
            $('input[name=cr-role]').change(function () {
              var role = this.value;
              $('.question-form button').prop('disabled', role != 'instructor');
              $('.role-comment').hide();
              $('.role-comment-' + role).show();
            });

            // Only show the "other" referral source input when "other" is selected.
            $('#cr-referral-source').change(function () {
              if (this.value === 'other') {
                $('#cr-referral-source-other')
                  .removeClass('d-none')
                  .attr('required', 'required')
                  .focus();
              } else {
                $('#cr-referral-source-other').addClass('d-none').removeAttr('required');
              }
            });
          });
        </script>
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar')%>", {
          ...resLocals,
          navPage: 'request_course',
        })}
        <main id="content" class="container">
          ${CourseRequestsCard({ rows })}
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
      <div class="card-header bg-primary text-white d-flex align-items-center">Course Requests</div>
      <div class="table-responsive">
        <table class="table table-sm table-hover table-striped">
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
                  <td>
                    ${renderEjs(__filename, "<%- include('approvalStatusIcon')%>", {
                      status: course_request.approved_status,
                    })}
                  </td>
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
        Request a New Course
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
            <label id="cr-referral-source-label">How did you hear about PrairieLearn?</label>
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
            <label>Your Role in the Course</label>
            <div class="form-control">
              <input type="radio" id="role-instructor" name="cr-role" value="instructor" />
              <label for="role-instructor">Official Course Instructor</label>
            </div>
            <div class="form-control">
              <input type="radio" id="role-ta" name="cr-role" value="ta" />
              <label for="role-ta">Teaching Assistant or other course staff</label>
            </div>
            <div class="form-control">
              <input type="radio" id="role-admin" name="cr-role" value="admin" />
              <label for="role-admin">Institution Administrative Staff</label>
            </div>
            <div class="form-control">
              <input type="radio" id="role-student" name="cr-role" value="student" />
              <label for="role-student">Student</label>
            </div>
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
