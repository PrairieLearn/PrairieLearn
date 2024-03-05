import { html, escapeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { User } from '../../lib/db-types';

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
        ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'administrators',
        })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              Administrators
              <button
                type="button"
                class="btn btn-sm btn-light ml-auto"
                id="administratorInsertButton"
                tabindex="0"
                data-toggle="popover"
                data-container="body"
                data-html="true"
                data-placement="auto"
                title="Add new administrator"
                data-content="${escapeHtml(
                  AdministratorInsertForm({
                    csrfToken: resLocals.__csrf_token,
                    id: 'administratorInsertButton',
                  }),
                )}"
              >
                <i class="fa fa-user-plus" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">Add administrator</span>
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <thead>
                  <tr>
                    <th>UID</th>
                    <th>Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  ${admins.map(
                    (admin, i) => html`
                      <tr>
                        <td class="align-middle">${admin.uid}</td>
                        <td class="align-middle">${admin.name}</td>
                        <td class="align-middle">
                          <button
                            type="button"
                            class="btn btn-sm btn-danger float-right"
                            id="administratorDeleteButton${i}"
                            tabindex="0"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Remove administrator access"
                            data-content="${escapeHtml(
                              AdministratorDeleteForm({
                                csrfToken: resLocals.__csrf_token,
                                id: 'administratorDeleteButton' + i,
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

function AdministratorInsertForm({ csrfToken, id }: { csrfToken: string; id: string }) {
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
          placeholder="username@domain.org"
        />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Add administrator</button>
      </div>
    </form>
  `;
}

function AdministratorDeleteForm({
  csrfToken,
  id,
  userId,
  uid,
}: {
  csrfToken: string;
  id: string;
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
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Remove access</button>
      </div>
    </form>
  `;
}
