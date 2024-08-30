import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import {
  type Institution,
  UserSchema,
  InstitutionAdministratorSchema,
} from '../../../lib/db-types.js';

export const InstitutionAdminAdminsRowSchema = z.object({
  user: UserSchema,
  institution_administrator: InstitutionAdministratorSchema,
});
type InstitutionAdminAdminsRow = z.infer<typeof InstitutionAdminAdminsRowSchema>;

export function InstitutionAdminAdmins({
  institution,
  rows,
  uidsLimit,
  resLocals,
}: {
  institution: Institution;
  rows: InstitutionAdminAdminsRow[];
  uidsLimit: number;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: `Admins — ${institution.short_name}` })}
        ${compiledScriptTag('institutionAdminAdminsClient.ts')}
      </head>
      <body>
        ${Navbar({
          resLocals: { ...resLocals, institution },
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'admins',
        })}
        <main id="content" class="container mb-4">
          ${AdminsCard({ rows })}
          ${AddAdminsModal({ uidsLimit, csrfToken: resLocals.__csrf_token })}
          ${RemoveAdminModal({ csrfToken: resLocals.__csrf_token })}
        </main>
      </body>
    </html>
  `.toString();
}

function AdminsCard({ rows }: { rows: InstitutionAdminAdminsRow[] }) {
  return html`
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
          Add administrators
        </button>
      </div>

      ${rows.length === 0
        ? html`
            <div class="card-body">
              <div class="text-center text-muted">No institution administrators</div>
            </div>
          `
        : html`
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
          `}
    </div>
  `;
}

function AddAdminsModal({ uidsLimit, csrfToken }: { uidsLimit: number; csrfToken: string }) {
  return Modal({
    id: 'addAdminsModal',
    title: 'Add administrators',
    body: html`
      <div class="form-group">
        <label for="addAdminsModalUid" class="form-label"> UIDs </label>
        <textarea
          name="uids"
          class="form-control"
          id="addAdminsModalUid"
          aria-describedby="addAdminsModalUidHelp"
          placeholder="user1@example.com, user2@example.com"
          style="height: 10vh;"
          required
        ></textarea>
        <small class="form-text text-muted" id="addAdminsModalUidHelp">
          Enter up to ${uidsLimit} UIDs separated by commas, semicolons, or whitespace.
        </small>
      </div>

      <div class="alert alert-warning mb-0" role="alert">
        Institution administrators will have full read and write access to all content within this
        institution. They will also be able to add and remove other administrators.
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
