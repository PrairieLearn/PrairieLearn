import { html, escapeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { type User } from '../../lib/db-types.js';

export function AdministratorAdmins({
  admins,
  resLocals,
}: {
  admins: User[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Administrators' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'administrators' })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Administrators</h1>
              <button
                type="button"
                class="btn btn-sm btn-light ml-auto"
                data-toggle="popover"
                data-container="body"
                data-html="true"
                data-placement="auto"
                title="Add new administrator"
                data-content="${escapeHtml(
                  AdministratorInsertForm({
                    csrfToken: resLocals.__csrf_token,
                  }),
                )}"
                data-testid="administrator-insert-button"
              >
                <i class="fa fa-user-plus" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">Add administrator</span>
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped" aria-label="Administrators">
                <thead>
                  <tr>
                    <th>UID</th>
                    <th>Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  ${admins.map(
                    (admin) => html`
                      <tr>
                        <td class="align-middle">${admin.uid}</td>
                        <td class="align-middle">${admin.name}</td>
                        <td class="align-middle">
                          <button
                            type="button"
                            class="btn btn-sm btn-danger float-right"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Remove administrator access"
                            data-content="${escapeHtml(
                              AdministratorDeleteForm({
                                csrfToken: resLocals.__csrf_token,
                                uid: admin.uid,
                                userId: admin.user_id,
                              }),
                            )}"
                          >
                            <i class="fa fa-times" aria-hidden="true"></i> Remove
                          </button>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>

            <div class="card-footer">
              <small>
                Administrators have full access to every course and course instance. They are
                automatically Owners of every course and Instructors of every course instance. They
                can add and remove other administrators.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function AdministratorInsertForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="add-user-form" method="POST">
      <input type="hidden" name="__action" value="administrators_insert_by_user_uid" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="form-group">
        <label for="administratorInsertFormUid">UID:</label>
        <input
          type="text"
          class="form-control"
          id="administratorInsertFormUid"
          name="uid"
          placeholder="username@example.com"
        />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Add administrator</button>
      </div>
    </form>
  `;
}

function AdministratorDeleteForm({
  csrfToken,
  userId,
  uid,
}: {
  csrfToken: string;
  userId: string;
  uid: string;
}) {
  return html`
    <form name="add-user-form" method="POST">
      <input type="hidden" name="__action" value="administrators_delete_by_user_id" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="user_id" value="${userId}" />
      <div class="form-group">
        <label>UID:</label>
        <p class="form-control-static">${uid}</p>
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Remove access</button>
      </div>
    </form>
  `;
}
