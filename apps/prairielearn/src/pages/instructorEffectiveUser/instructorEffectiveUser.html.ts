import { format, toZonedTime } from 'date-fns-tz';
import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import {
  CourseInstancePermissionSchema,
  CoursePermissionSchema,
  UserSchema,
} from '../../lib/db-types.js';

export const CourseRolesSchema = z.object({
  available_course_roles: CoursePermissionSchema.shape.course_role.unwrap().array(),
  available_course_instance_roles: CourseInstancePermissionSchema.shape.course_instance_role
    .unwrap()
    .array(),
  available_uids: UserSchema.shape.uid.array().nullable(),
});
export type CourseRoles = z.infer<typeof CourseRolesSchema>;

export function InstructorEffectiveUser({
  resLocals,
  ipAddress,
  courseRoles,
}: {
  resLocals: Record<string, any>;
  ipAddress: string;
  courseRoles: CourseRoles;
}) {
  const { authz_data, course_instance, __csrf_token, req_date, true_req_date, user } = resLocals;

  // This page can be mounted under `/pl/course/...`, in which case we won't
  // have a course instance to get a display timezone from. In that case, we'll
  // fall back to the course, and then to the institution. All institutions must
  // have a display timezone, so we're always guaranteed to have one.
  const displayTimezone =
    resLocals.course_instance?.display_timezone ??
    resLocals.course.display_timezone ??
    resLocals.institution.display_timezone;

  const formattedTrueReqDate = format(
    toZonedTime(true_req_date, displayTimezone),
    "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
    { timeZone: displayTimezone },
  );
  const formattedReqDate = format(
    toZonedTime(req_date, displayTimezone),
    "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
    { timeZone: displayTimezone },
  );

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Change Effective User' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'effective' })}
        <main id="content" class="container-fluid">
          <h1 class="sr-only">Effective User</h1>
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Authenticated user</h2>
            </div>

            <div class="card-body">
              <p><strong>Authenticated UID:</strong> ${authz_data.authn_user.uid}</p>
              <p><strong>Authenticated name:</strong> ${authz_data.authn_user.name}</p>
              <p><strong>Authenticated course role:</strong> ${authz_data.authn_course_role}</p>
              ${course_instance
                ? html`
                    <p>
                      <strong>Authenticated course instance role:</strong>
                      ${authz_data.authn_course_instance_role}
                    </p>
                  `
                : ''}
              <p><strong>Authenticated mode:</strong> ${authz_data.authn_mode}</p>
              <p><strong>Authenticated date:</strong> ${formattedTrueReqDate}</p>

              <form id="resetForm" method="POST">
                <p>
                  <input type="hidden" name="__action" value="reset" />
                  <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                  <button type="submit" class="btn btn-info">Reset to these values</button>
                </p>
              </form>

              <p><strong>Connecting from IP:</strong> ${ipAddress}</p>
            </div>

            <div class="card-footer">
              <small>
                The <em>authenticated</em> values above are the ones that you logged in with. The
                <em>effective</em> values below allow you to view PrairieLearn as if you had a
                different <em>course role</em> or as if you were a specific other person with a
                different <em>UID</em>. This can be used to test out how PrairieLearn will look from
                different points of view. The “Reset to these values” button above will reset all
                effective values below to your authenticated values. Effective values are also reset
                when you choose a course instance or when you switch to a different course.
              </small>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Effective user</h2>
            </div>

            <div class="card-body">
              <p><strong>Effective UID:</strong> ${user.uid}</p>
              <p><strong>Effective name:</strong> ${user.name}</p>

              <div class="alert alert-secondary mb-0">
                <form id="changeUidForm" class="form-inline" method="POST">
                  <div class="form-group">
                    <label class="mr-2" for="changeEffectiveUid">Change effective UID to:</label>
                    <input
                      list="userList"
                      type="text"
                      class="form-control mr-2"
                      style="width: 20em;"
                      name="pl_requested_uid"
                      id="changeEffectiveUid"
                      placeholder="username@example.com"
                    />
                    <datalist id="userList">
                      ${courseRoles.available_uids?.map(
                        (available_uid) => html`
                          <option value="${available_uid}">${available_uid}</option>
                        `,
                      )}
                    </datalist>
                  </div>
                  <input type="hidden" name="__action" value="changeUid" />
                  <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                  <button type="submit" class="btn btn-primary">Change UID</button>
                </form>
              </div>
            </div>

            <div class="card-footer">
              <small>
                Changing your effective user identity to another person allows you to see
                PrairieLearn exactly as they would see it. You cannot emulate an effective user with
                a higher access level than your own.
              </small>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Effective course role</h2>
            </div>

            <div class="card-body">
              <p><strong>Effective course role:</strong> ${authz_data.course_role}</p>

              <div class="alert alert-secondary mb-0">
                <form class="form-inline" id="changeCourseRoleForm" method="POST">
                  <div class="form-group">
                    <label class="mr-2" for="changeEffectiveCourseRole"
                      >Change effective course role to:</label
                    >
                    <select
                      class="custom-select mr-2"
                      id="changeEffectiveCourseRole"
                      name="pl_requested_course_role"
                    >
                      ${courseRoles.available_course_roles
                        .reverse()
                        .map((available_course_role) =>
                          available_course_role === authz_data.course_role
                            ? html`
                                <option value="${available_course_role}" selected>
                                  ${available_course_role} (current)
                                </option>
                              `
                            : html`
                                <option value="${available_course_role}">
                                  ${available_course_role}
                                </option>
                              `,
                        )}
                    </select>
                  </div>
                  <input type="hidden" name="__action" value="changeCourseRole" />
                  <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                  <button type="submit" class="btn btn-primary">Change course role</button>
                </form>
              </div>
            </div>

            <div class="card-footer">
              <small>
                Your <em>course role</em> determines the permissions that you have to view and edit
                course content in PrairieLearn. It is specific to this course, so you can be an
                Editor in one course but a Previewer in a different course.
              </small>
            </div>
          </div>

          ${course_instance
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white">
                    <h2>Effective course instance role</h2>
                  </div>

                  <div class="card-body">
                    <p>
                      <strong>Effective course instance role:</strong>
                      ${authz_data.course_instance_role}
                    </p>

                    <div class="alert alert-secondary mb-0">
                      <form class="form-inline" id="changeCourseInstanceRoleForm" method="POST">
                        <div class="form-group">
                          <label class="mr-2" for="changeEffectiveCourseInstanceRole">
                            Change effective course instance role to:
                          </label>
                          <select
                            class="custom-select mr-2"
                            id="changeEffectiveCourseInstanceRole"
                            name="pl_requested_course_instance_role"
                          >
                            ${courseRoles.available_course_instance_roles
                              .reverse()
                              .map((available_course_instance_role) =>
                                available_course_instance_role === authz_data.course_instance_role
                                  ? html`
                                      <option value="${available_course_instance_role}" selected>
                                        ${available_course_instance_role} (current)
                                      </option>
                                    `
                                  : html`
                                      <option value="${available_course_instance_role}">
                                        ${available_course_instance_role}
                                      </option>
                                    `,
                              )}
                          </select>
                        </div>
                        <input type="hidden" name="__action" value="changeCourseInstanceRole" />
                        <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                        <button type="submit" class="btn btn-primary">
                          Change course instance role
                        </button>
                      </form>
                    </div>
                  </div>

                  <div class="card-footer">
                    <small>
                      Your <em>course instance role</em> determines the permissions that you have to
                      view and edit student data in PrairieLearn. It is specific to this course
                      instance, so you can be a Student Data Editor in one course instance but a
                      Student Data Viewer in a different course instance.
                    </small>
                  </div>
                </div>
              `
            : ''}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Effective date</h2>
            </div>

            <div class="card-body">
              <p><strong>Effective date:</strong> ${formattedReqDate}</p>

              <div class="alert alert-secondary mb-0">
                <form class="form-inline" id="changeDateForm" method="POST">
                  <div class="form-group">
                    <label class="mr-2" for="changeDate">Change effective date to:</label>
                    <input
                      type="text"
                      class="form-control mr-2"
                      style="width:30em;"
                      id="changeDate"
                      name="pl_requested_date"
                      value="${formattedReqDate}"
                    />
                  </div>
                  <input type="hidden" name="__action" value="changeDate" />
                  <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                  <button type="submit" class="btn btn-primary">Change date</button>
                </form>
              </div>
            </div>

            <div class="card-footer">
              <small>
                The <em>date</em> of the server determines which assessments are available. Changing
                the effective date to something other than the current date allows you to check if
                homework and exam assessments will be available to students when you mean them to
                be. The date has the format <code>YYYY-MM-DDTHH:MM:SS.SSS</code>, with a suffix that
                gives the offset from UTC (i.e., the time zone) in the format
                <code>&plusmn;HH:MM</code>.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
