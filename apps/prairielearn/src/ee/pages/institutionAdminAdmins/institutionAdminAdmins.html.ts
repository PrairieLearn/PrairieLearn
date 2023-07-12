import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import {
  type Institution,
  UserSchema,
  InstitutionAdministratorSchema,
} from '../../../lib/db-types';
import { compiledScriptTag } from '../../../lib/assets';
import { Modal } from '../../../components/Modal';

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
          pageTitle: 'Administrators',
        })}
        ${compiledScriptTag('institutionAdminAdminsClient.ts')}
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
              <ul class="list-group list-group-flush">
                ${rows.map(
                  (row) => html`
                    <li class="list-group-item d-flex flex-row align-items-center">
                      <div class="d-flex flex-column">
                        <span>${row.user.name}</span>
                        <span class="text-muted">${row.user.uid}</span>
                      </div>

                      <button
                        class="btn btn-sm btn-outline-danger ml-auto js-remove-admin"
                        data-toggle="modal"
                        data-target="#removeAdminModal"
                        type="button"
                        data-name-and-uid="${row.user.name} (${row.user.uid})"
                        data-institution-administrator-id="${row.institution_administrator.id}"
                      >
                        Remove
                      </button>
                    </li>
                  `,
                )}
              </ul>
            </div>
          </div>
        </main>
        ${AddAdminsModal({ csrfToken: resLocals.__csrf_token })}
        ${RemoveAdminModal({ csrfToken: resLocals.__csrf_token })}
      </body>
    </html>
  `.toString();
}

function AddAdminsModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'addAdminsModal',
    title: 'Add administrators',
    body: html`
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
    `,
    footer: html`
      <input type="hidden" name="__action" value="addAdmins" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      <button type="submit" class="btn btn-primary">Add administrators</button>
    `,
  });
}

function RemoveAdminModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'removeAdminModal',
    title: 'Remove administrator',
    body: html`
      <p>
        Are you sure you want to remove
        <strong><span class="js-name-and-uid"></span></strong>
        as an administrator of this institution? This will not affect any of their other roles.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__action" value="removeAdmin" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input
        type="hidden"
        name="unsafe_institution_administrator_id"
        class="js-institution-administrator-id"
      />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Remove administrator</button>
    `,
  });
}
