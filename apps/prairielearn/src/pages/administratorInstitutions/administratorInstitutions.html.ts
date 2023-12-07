import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { isEnterprise } from '../../lib/license';
import { InstitutionSchema } from '../../lib/db-types';

export const InstitutionRowSchema = z.object({
  institution: InstitutionSchema,
  authn_providers: z.array(z.string()),
});
type InstitutionRow = z.infer<typeof InstitutionRowSchema>;

export function AdministratorInstitutions({
  institutions,
  resLocals,
}: {
  institutions: InstitutionRow[];
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
        <main id="content" class="container-fluid">
          <div id="institutions" class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              Institutions
              <button
                type="button"
                class="btn btn-sm btn-light ml-auto"
                data-toggle="modal"
                data-target="#add-institution-modal"
              >
                <i class="fas fa-plus"></i>
                <span class="d-none d-sm-inline">Add institution</span>
              </button>
            </div>
            ${addInstitutionModal({ csrf_token: resLocals.__csrf_token })}
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <thead>
                  <tr>
                    <th>Short name</th>
                    <th>Long name</th>
                    <th>Timezone</th>
                    <th>UID regexp</th>
                    <th>Authn providers</th>
                  </tr>
                </thead>
                <tbody>
                  ${institutions.map(
                    ({ institution, authn_providers }) => html`
                      <tr>
                        <td>
                          ${isEnterprise()
                            ? html`
                                <a href="/pl/institution/${institution.id}/admin">
                                  ${institution.short_name}
                                </a>
                              `
                            : html`
                                <a href="/pl/administrator/institution/${institution.id}">
                                  ${institution.short_name}
                                </a>
                              `}
                        </td>
                        <td>${institution.long_name}</td>
                        <td>${institution.display_timezone}</td>
                        <td><code>${institution.uid_regexp}</code></td>
                        <td>${authn_providers.join(', ')}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
            <div class="card-footer">
              <small>
                To update institutions, click the edit button to the left of the institution.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function addInstitutionModal({ csrf_token }: { csrf_token: string }) {
  return html`
    <div
      class="modal fade"
      id="add-institution-modal"
      tabindex="-1"
      role="dialog"
      aria-labelledby="add-institution-modal-label"
      aria-hidden="true"
    >
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Add Institution</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <form name="add-institution" id="add-institution" method="POST">
              <input type="hidden" name="__action" value="add_institution" />
              <input type="hidden" name="__csrf_token" value="${csrf_token}" />
              <div class="form-group">
                <label for="short_name">Short name</label>
                <input
                  type="text"
                  class="form-control"
                  id="short_name"
                  name="short_name"
                  placeholder="Short name"
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
                  placeholder="Long name"
                />
                <small id="long_name_help" class="form-text text-muted">
                  Use the full name of the university. E.g., "University of Illinois
                  Urbana-Champaign".
                </small>
              </div>
              <div class="form-group">
                <label for="display_timezone">Timezone</label>
                <input
                  type="text"
                  class="form-control"
                  id="display_timezone"
                  name="display_timezone"
                  placeholder="Timezone"
                />
                <small id="display_timezone_help" class="form-text text-muted">
                  The allowable timezones are from the
                  <a
                    href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                    target="_blank"
                    >tz database</a
                  >. It's best to use a city-based timezone that has the same times as you. E.g.,
                  "America/Chicago".
                </small>
              </div>
              <div class="form-group">
                <label for="uid_regexp">UID regexp</label>
                <input
                  type="text"
                  class="form-control"
                  id="uid_regexp"
                  name="uid_regexp"
                  placeholder="UID regexp"
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
                  placeholder="Authn providers"
                />
                <small id="authn_providers_help" class="form-text text-muted"
                  >This is the list of authentication providers used for login. Authentication
                  providers must be separated by a comma and a space. E.g., "Azure, Google"</small
                >
              </div>
              <div class="form-group">
                <label for="course_instance_enrollment_limit"
                  >Course instance enrollment limit</label
                >
                <input
                  type="text"
                  class="form-control"
                  id="course_instance_enrollment_limit"
                  name="course_instance_enrollment_limit"
                  placeholder="Course instance enrollment limit"
                />
                <small id="course_instance_enrollment_limit_help" class="form-text text-muted">
                  The maximum number of enrollments allowed for a single course instance. This value
                  can be overridden on individual course instances.
                </small>
              </div>
              <div class="form-group">
                <label for="yearly_enrollment_limit">Yearly enrollment limit</label>
                <input
                  type="text"
                  class="form-control"
                  id="yearly_enrollment_limit"
                  name="yearly_enrollment_limit"
                  placeholder="Yearly enrollment limit"
                />
                <small id="yearly_enrollment_limit_help" class="form-text text-muted">
                  The maximum number of enrollments allowed per year. The limit is applied on a
                  rolling basis; that is, it applies to the previous 365 days from the instant a
                  student attempts to enroll.
                </small>
              </div>
            </form>
          </div>
          <div id="add-institution-modal-footer" class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              data-dismiss="modal"
              onclick="$('#add-institution-modal').modal('hide')"
            >
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" form="add-institution">
              Add institution
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
