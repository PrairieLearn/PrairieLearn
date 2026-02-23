import { format, toZonedTime } from 'date-fns-tz';
import { z } from 'zod';

import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import {
  CourseInstancePermissionSchema,
  CoursePermissionSchema,
  UserSchema,
} from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export const CourseRolesSchema = z.object({
  available_course_roles: CoursePermissionSchema.shape.course_role.unwrap().array(),
  available_course_instance_roles: CourseInstancePermissionSchema.shape.course_instance_role
    .unwrap()
    .array(),
  available_uids: UserSchema.shape.uid.array().nullable(),
});
type CourseRoles = z.infer<typeof CourseRolesSchema>;

export function InstructorEffectiveUser({
  resLocals,
  ipAddress,
  courseRoles,
}: {
  resLocals: ResLocalsForPage<'course' | 'course-instance'>;
  ipAddress: string | undefined;
  courseRoles: CourseRoles;
}) {
  const {
    authz_data,
    course_instance,
    course,
    __csrf_token,
    req_date,
    true_req_date,
    user,
    navbarType,
  } = resLocals;

  // This page can be mounted under `/pl/course/...`, in which case we won't
  // have a course instance to get a display timezone from. In that case, we'll
  // fall back to the course, which is guaranteed to have a display timezone.
  const displayTimezone = course_instance?.display_timezone ?? course.display_timezone;

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

  return PageLayout({
    pageTitle: 'Change Effective User',
    resLocals,
    navContext: {
      type: navbarType,
      page: 'effective',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <h1 class="visually-hidden">Effective User</h1>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>Authenticated user</h2>
        </div>

        <div class="card-body">
          <p><strong>Authenticated UID:</strong> ${authz_data.authn_user.uid}</p>
          <p><strong>Authenticated name:</strong> ${authz_data.authn_user.name}</p>
          <p><strong>Authenticated course role:</strong> ${authz_data.authn_course_role}</p>
          ${'authn_course_instance_role' in authz_data
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

          <p><strong>Connecting from IP:</strong> ${ipAddress ?? html`<em>unknown</em>`}</p>
        </div>

        <div class="card-footer">
          <small>
            The <em>authenticated</em> values above are the ones that you logged in with. The
            <em>effective</em> values below allow you to view PrairieLearn as if you had a different
            <em>course role</em> or as if you were a specific other person with a different
            <em>UID</em>. This can be used to test out how PrairieLearn will look from different
            points of view. The “Reset to these values” button above will reset all effective values
            below to your authenticated values. Effective values are also reset when you choose a
            course instance or when you switch to a different course.
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
            <form id="changeUidForm" method="POST">
              <div class="mb-3">
                <label class="form-label" for="changeEffectiveUid">Change effective UID to:</label>
                <input
                  list="userList"
                  type="text"
                  class="form-control me-2 w-100"
                  style="max-width: 20em;"
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
            Changing your effective user identity to another person allows you to see PrairieLearn
            exactly as they would see it. You cannot emulate an effective user with a higher access
            level than your own.
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
            <form id="changeCourseRoleForm" method="POST">
              <div class="mb-3">
                <label class="form-label" for="changeEffectiveCourseRole">
                  Change effective course role to:
                </label>
                <select
                  class="form-select me-2"
                  id="changeEffectiveCourseRole"
                  name="pl_requested_course_role"
                >
                  ${[...courseRoles.available_course_roles]
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
            course content in PrairieLearn. It is specific to this course, so you can be an Editor
            in one course but a Previewer in a different course.
          </small>
        </div>
      </div>

      ${'course_instance_role' in authz_data
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
                  <form id="changeCourseInstanceRoleForm" method="POST">
                    <div class="mb-3">
                      <label class="form-label" for="changeEffectiveCourseInstanceRole">
                        Change effective course instance role to:
                      </label>
                      <select
                        class="form-select me-2"
                        id="changeEffectiveCourseInstanceRole"
                        name="pl_requested_course_instance_role"
                      >
                        ${[...courseRoles.available_course_instance_roles]
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
                  instance, so you can be a Student Data Editor in one course instance but a Student
                  Data Viewer in a different course instance.
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
            <form id="changeDateForm" method="POST">
              <div class="mb-3">
                <label class="form-label" for="changeDate">Change effective date to:</label>
                <input
                  type="text"
                  class="form-control me-2 w-100"
                  style="max-width: 30em;"
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
            The <em>date</em> of the server determines which assessments are available. Changing the
            effective date to something other than the current date allows you to check if homework
            and exam assessments will be available to students when you mean them to be. The date
            has the format <code>YYYY-MM-DDTHH:MM:SS.SSS</code>, with a suffix that gives the offset
            from UTC (i.e., the time zone) in the format <code>&plusmn;HH:MM</code>.
          </small>
        </div>
      </div>
    `,
  });
}
