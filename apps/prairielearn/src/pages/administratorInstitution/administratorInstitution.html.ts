import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { InstitutionSchema } from '../../lib/db-types';

export const InstitutionRowSchema = z.object({
  institution: InstitutionSchema,
  authn_providers: z.array(z.string()),
});
type InstitutionRow = z.infer<typeof InstitutionRowSchema>;

export function AdministratorInstitution({
  institutionRow,
  resLocals,
}: {
  institutionRow: InstitutionRow | null;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Institutions',
        })}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'institutions',
        })}
        <main class="container mb-4">
          <h2 class="h4">Edit Institution</h2>
          <form name="edit-institution" id="edit-institution" method="POST">
            <input
              type="hidden"
              name="__action"
              value="edit_institution"
            />
            <input
              type="hidden"
              name="original_authn_providers"
              value="${institutionRow?.authn_providers.join(', ')}"
            />
            <input
              type="hidden"
              name="__csrf_token"
              value="${resLocals.__csrf_token}"
            />
            <input
              type="hidden"
              name="id"
              value="${institutionRow?.institution.id}"
            />
            <div class="form-group">
              <label for="short_name">Short name</label>
              <input
                type="text"
                class="form-control"
                id="short_name"
                name="short_name"
                value="${institutionRow?.institution.short_name}"
              />
              <small id="short_name_help" class="form-text text-muted">
                Use an abbreviation or short name. E.g., "UIUC" or "Berkeley".
              </small>
            </div>
            <div class="form-group">
              <label for="long_name">Long name</label>
              <input
                type="text"
                class="form-control"
                id="long_name"
                name="long_name"
                value="${institutionRow?.institution.long_name}"
              />
              <small id="long_name_help" class="form-text text-muted">
                Use the full name of the university. E.g., "University of Illinois Urbana-Champaign".
              </small>
            </div>
            <div class="form-group">
              <label for="display_timezone">Timezone</label>
              <input
                type="text"
                class="form-control"
                id="display_timezone"
                name="display_timezone"
                value="${institutionRow?.institution.display_timezone}"
              />
              <small id="display_timezone_help" class="form-text text-muted">
                The allowable timezones are from the <a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank">tz database</a>. It's best to use a city-based timezone that has the same times as you. E.g., "America/Chicago".
              </small>
            </div>
            <div class="form-group">
              <label for="uid_regexp">UID regexp</label>
              <input
                type="text"
                class="form-control"
                id="uid_regexp"
                name="uid_regexp"
                value="${institutionRow?.institution.uid_regexp}"
              />
              <small id="uid_regexp_help" class="form-text text-muted">
                Should match the non-username part of students' UIDs. E.g., @example.com$.
              </small>
            </div>
            <div class="form-group">
              <label for="authn_providers">Authn providers </label>
              <input
                type="text"
                class="form-control"
                id="authn_providers"
                name="authn_providers"
                value="${institutionRow?.authn_providers.join(', ')}"
              />
              <small id="authn_providers_help" class="form-text text-muted">This is the list of authentication providers used for login. Authentication providers must be separated by a comma and a space. E.g., "Azure, Google"</small>
            </div>
            <div class="form-group">
              <label for="course_instance_enrollment_limit">Course instance enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="course_instance_enrollment_limit"
                name="course_instance_enrollment_limit"
                value="${institutionRow?.institution.course_instance_enrollment_limit}"
              />
              <small id="course_instance_enrollment_limit_help" class="form-text text-muted">
              The maximum number of enrollments allowed for a single course instance. This value can be overridden on individual course instances.
            </small>
            </div>
            <div class="form-group">
              <label for="yearly_enrollment_limit">Yearly enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="yearly_enrollment_limit"
                name="yearly_enrollment_limit"
                value="${institutionRow?.institution.yearly_enrollment_limit}"
              />
              <small id="yearly_enrollment_limit_help" class="form-text text-muted">
                The maximum number of enrollments allowed per year. The limit is applied on a rolling basis; that is, it applies
                to the previous 365 days from the instant a student attempts to enroll.
              </small>
            </div>
            </button>
            <a href="../institutions">
              <button type="button" class="btn btn-secondary">
              Cancel
              </button>
            <a>
            <button type="submit" class="btn btn-primary">
            Save
            </button>
            </div>
          </form>
        </main>
      </body>
    </html>
  `.toString();
}
