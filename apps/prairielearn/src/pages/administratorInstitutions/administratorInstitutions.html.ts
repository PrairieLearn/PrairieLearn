import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { InstitutionSchema } from '../../lib/db-types';
import { type Timezone } from '../../lib/timezones';

export const InstitutionRowSchema = z.object({
  institution: InstitutionSchema,
  authn_providers: z.array(z.string()),
});
type InstitutionRow = z.infer<typeof InstitutionRowSchema>;

export function AdministratorInstitutions({
  institutions,
  availableTimezones,
  resLocals,
}: {
  institutions: InstitutionRow[];
  availableTimezones: Map<string, Timezone>;
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
            ${AddInstitutionModal({ csrf_token: resLocals.__csrf_token, availableTimezones })}
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
                          <a href="/pl/institution/${institution.id}/admin">
                            ${institution.short_name}
                          </a>
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
                This is a list of all institutions in the database. Click on an institution name to
                view more details or edit configuration.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function AddInstitutionModal({
  csrf_token,
  availableTimezones,
}: {
  csrf_token: string;
  availableTimezones: Map<string, Timezone>;
}) {
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
                <select class="form-control" id="display_timezone" name="display_timezone">
                  <option value="" selected disabled hidden>Timezone</option>
                  ${Array.from(availableTimezones.keys()).map(
                    (timezoneName) => html`
                      <option value="${timezoneName}">${timezoneName}</option>
                    `,
                  )}
                </select>
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
