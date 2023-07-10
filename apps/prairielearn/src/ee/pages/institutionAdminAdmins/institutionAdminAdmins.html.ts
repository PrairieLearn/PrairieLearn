import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import {
  type Institution,
  UserSchema,
  InstitutionAdministratorSchema,
} from '../../../lib/db-types';

export const InstitutionAdminAdminsRowSchema = z.object({
  user: UserSchema,
  institution_administrator: InstitutionAdministratorSchema,
});
type InstitutionAdminAdminsRow = z.infer<typeof InstitutionAdminAdminsRowSchema>;

export function InstitutionAdminAdmins({
  institution,
  rows,
  resLocals,
}: {
  institution: Institution;
  rows: InstitutionAdminAdminsRow[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'Admins',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'admins',
        })}
        <main class="container mb-4">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              Administrators
              <button
                type="button"
                class="btn btn-sm btn-light ml-auto"
                data-toggle="modal"
                data-target="#addAdminsModal"
              >
                <i class="fa fa-user-plus" aria-hidden="true"></i>
                Add administrator
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <thead>
                  <th>UID</th>
                  <th>Name</th>
                  <th>Actions</th>
                </thead>
                <tbody>
                  ${rows.map(
                    (row) => html`
                      <tr>
                        <td>${row.user.uid}</td>
                        <td>${row.user.name}</td>
                        <td>
                          <span class="dropdown">
                            <button
                              type="button"
                              class="btn btn-light dropdown-toggle btn-xs"
                              title="Actions for ${row.user.uid}"
                              aria-expanded="false"
                              data-toggle="dropdown"
                            ></button>
                            <div class="dropdown-menu">
                              <button class="dropdown-item" type="button">
                                <i class="bi-x-lg"></i>
                                Remove admin
                              </button>
                            </div>
                          </span>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
        ${AddAdminsModal({ csrfToken: resLocals.__csrf_token })}
      </body>
    </html>
  `.toString();
}

function AddAdminsModal({ csrfToken }: { csrfToken: string }) {
  return html`
    <div
      class="modal fade"
      id="addAdminsModal"
      tabindex="-1"
      aria-labelledby="addAdminsModalLabel"
      aria-hidden="true"
    >
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <form method="POST">
            <div class="modal-header">
              <h5 class="modal-title" id="addAdminsModalLabel">Add admins</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label for="addAdminsModalUid" class="form-label">
                  List of UIDs separated by commas, whitespace, line breaks, or semicolons
                </label>
                <textarea
                  name="uids"
                  class="form-control"
                  id="addAdminsModalUid"
                  placeholder="user1@example.org, user2@example.org"
                  style="height: 10vh;"
                  required
                ></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <input type="hidden" name="__action" value="addAdmins" />
              <input type="hidden" name="__csrf_token" value="${csrfToken}" />
              <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
              <button type="submit" class="btn btn-primary">Add admins</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}
