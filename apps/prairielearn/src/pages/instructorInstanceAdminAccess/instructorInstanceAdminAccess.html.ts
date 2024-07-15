import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { CourseInstanceAccessRule } from '../../lib/db-types.js';

export function InstructorInstanceAdminAccess({
  resLocals,
  accessRules,
}: {
  resLocals: Record<string, any>;
  accessRules: CourseInstanceAccessRule[];
}) {
  const { authz_data, course_instance } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        <script>
          $(() => {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/courseInstanceSyncErrorsAndWarnings'); %>",
            resLocals,
          )}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${course_instance.long_name} course instance access rules
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th>UIDs</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Institution</th>
                  </tr>
                </thead>
                <tbody>
                  ${accessRules.map((accessRule) =>
                    AccessRuleRow({
                      accessRule,
                      timeZone: course_instance.display_timezone,
                      hasCourseInstancePermissionView:
                        authz_data.has_course_instance_permission_view,
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function AccessRuleRow({
  accessRule,
  timeZone,
  hasCourseInstancePermissionView,
}: {
  accessRule: CourseInstanceAccessRule;
  timeZone: string;
  hasCourseInstancePermissionView: boolean;
}) {
  return html`
    <tr>
      <td>
        ${accessRule.uids == null
          ? html`&mdash;`
          : // Only users with permission to view student data are allowed to
            // see the list of uids associated with an access rule. Note,
            // however, that any user with permission to view course code (or
            // with access to the course git repository) will be able to see the
            // list of uids, because these access rules are defined in course
            // code. This should be changed in future, to protect student data.
            hasCourseInstancePermissionView
            ? accessRule.uids.join(', ')
            : html`
                <a
                  role="button"
                  class="btn btn-xs btn-warning"
                  tabindex="0"
                  data-toggle="popover"
                  data-trigger="focus"
                  data-container="body"
                  data-placement="auto"
                  title="Hidden UIDs"
                  data-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
                >
                  Hidden
                </a>
              `}
      </td>
      <td>
        ${accessRule.start_date == null
          ? html`&mdash;`
          : formatDate(accessRule.start_date, timeZone)}
      </td>
      <td>
        ${accessRule.end_date == null ? html`&mdash;` : formatDate(accessRule.end_date, timeZone)}
      </td>
      <td>${accessRule.institution ?? html`&mdash;`}</td>
    </tr>
  `;
}
