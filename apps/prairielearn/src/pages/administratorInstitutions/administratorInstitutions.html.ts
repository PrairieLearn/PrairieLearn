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
                    <th></th>
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
                          <button
                            type="button"
                            class="btn btn-sm"
                            data-toggle="modal"
                            data-target="#edit-institution-modal-${institution.id}"
                          >
                            <i class="fas fa-edit"></i>
                          </button>
                          ${editInstitutionModal({
                            csrf_token: resLocals.__csrf_token,
                            institution,
                            authn_providers,
                          })}
                        </td>
                        <td>
                          ${isEnterprise()
                            ? html`
                                <a href="/pl/institution/${institution.id}/admin">
                                  ${institution.short_name}
                                </a>
                              `
                            : institution.short_name}
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

function editInstitutionModal({
  csrf_token,
  institution,
  authn_providers,
}: InstitutionRow & { csrf_token: string }) {
  return html`
  <div
    class="modal fade"
    id="edit-institution-modal-${institution.id}"
    role="dialog"
    aria-labelledby="edit-institution-modal-label"
    aria-hidden="true"
  >
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            Edit Institution
          </h5>
          <button
            type="button"
            class="close"
            data-dismiss="modal"
            aria-label="Close"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <form name="edit-institution" id="edit-institution-${institution.id}" method="POST">
            <input
              type="hidden"
              name="__action"
              value="edit_institution"
            />
            <input
              type="hidden"
              name="original_authn_providers"
              value="${authn_providers.join(', ')}"
            />
            <input
              type="hidden"
              name="__csrf_token"
              value="${csrf_token}"
            />
            <input
              type="hidden"
              name="id"
              value="${institution.id}"
            />
            <div class="form-group">
              <label for="short_name">Short name</label>
              <input
                type="text"
                class="form-control"
                id="short_name"
                name="short_name"
                value="${institution.short_name}"
              />
            </div>
            <div class="form-group">
              <label for="long_name">Long name</label>
              <input
                type="text"
                class="form-control"
                id="long_name"
                name="long_name"
                value="${institution.long_name}"
              />
            </div>
            <div class="form-group">
              <label for="display_timezone">Timezone</label>
              <input
                type="text"
                class="form-control"
                id="display_timezone"
                name="display_timezone"
                value="${institution.display_timezone}"
              />
            </div>
            <div class="form-group">
              <label for="uid_regexp">UID regexp</label>
              <input
                type="text"
                class="form-control"
                id="uid_regexp"
                name="uid_regexp"
                value="${institution.uid_regexp}"
              />
            <div class="form-group">
              <label for="authn_providers">Authn providers <p><small>Note: authn providers must be separated by a comma and a space (i.e, "Azure, Google") </small><p></label>
              <input
                type="text"
                class="form-control"
                id="authn_providers"
                name="authn_providers"
                value="${authn_providers.join(', ')}"
              />
            </div>
            <div class="form-group">
              <label for="course_instance_enrollment_limit">Course instance enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="course_instance_enrollment_limit"
                name="course_instance_enrollment_limit"
                value="${institution.course_instance_enrollment_limit}"
              />
            </div>
            <div class="form-group">
              <label for="yearly_enrollment_limit">Yearly enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="yearly_enrollment_limit"
                name="yearly_enrollment_limit"
                value="${institution.yearly_enrollment_limit}"
              />
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            data-dismiss="modal"
          >
            Close
          </button>
          <button type="submit" class="btn btn-primary" form="edit-institution-${institution.id}">
            Save changes
          </button>
        </div>
      </div>
    </div>
  </div>
  `;
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
              </div>
              <div class="form-group">
                <label for="authn_providers"
                  >Authn providers
                  <p>
                    <small
                      >Note: authn providers must be separated by a comma and a space (i.e, "Azure,
                      Google")
                    </small>
                  </p>
                  <p></p
                ></label>
                <input
                  type="text"
                  class="form-control"
                  id="authn_providers"
                  name="authn_providers"
                  placeholder="Authn providers"
                />
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
