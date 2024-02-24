import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { IdSchema, Institution, User } from '../../lib/db-types';
import { type Purchase } from '../../ee/lib/billing/purchases';
import { isEnterprise } from '../../lib/license';
import { UserSettingsPurchasesCard } from '../../ee/lib/billing/components/UserSettingsPurchasesCard.html';

export const AccessTokenSchema = z.object({
  created_at: z.string(),
  id: IdSchema,
  last_used_at: z.string().nullable(),
  name: z.string(),
  token_hash: z.string(),
  token: z.string().nullable(),
});
type AccessToken = z.infer<typeof AccessTokenSchema>;

export function UserSettings({
  authn_user,
  authn_institution,
  authn_provider_name,
  accessTokens,
  newAccessTokens,
  purchases,
  resLocals,
}: {
  authn_user: User;
  authn_institution: Institution;
  authn_provider_name: string;
  accessTokens: AccessToken[];
  newAccessTokens: string[];
  purchases: Purchase[];
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
        ${renderEjs(__filename, "<%- include('../../pages/partials/navbar') %>", {
          ...resLocals,
          navPage: 'user_settings',
        })}
        <main id="content" class="container">
          <h1 class="mb-4">Settings</h1>
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              User profile
            </div>
            <table class="table table-sm two-column-description">
              <tbody>
                <tr>
                  <th>User ID (UID)</th>
                  <td>${authn_user.uid}</td>
                </tr>
                <tr>
                  <th>User Name</th>
                  <td>${authn_user.name}</td>
                </tr>
                <tr>
                  <th>Unique Identifier (UIN)</th>
                  <td>${authn_user.uin}</td>
                </tr>
                <tr>
                  <th>Institution</th>
                  <td>${authn_institution.long_name} (${authn_institution.short_name})</td>
                </tr>
                <tr>
                  <th>Authentication method</th>
                  <td>${authn_provider_name}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${isEnterprise() ? UserSettingsPurchasesCard({ purchases }) : ''}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">Browser configuration</div>
            <div class="card-body">
              <p>
                This section will let you reset browser settings related to technology inside
                PrairieLearn.
              </p>
              <p>
                If math formulas shows up as code like
                <strong>$ x = rac {-b pm sqrt {b^2 - 4ac}}{2a} $</strong>
                resetting the MathJax menu settings might help.
              </p>
              <p>
                <button
                  class="btn btn-md btn-info"
                  onClick="localStorage.removeItem('MathJax-Menu-Settings');alert('MathJax menu settings have been reset');"
                >
                  Reset MathJax menu settings
                </button>
              </p>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              Personal access tokens
              <button
                id="generateTokenButton"
                type="button"
                class="btn btn-light btn-sm ml-auto"
                data-toggle="popover"
                data-container="body"
                data-html="true"
                data-placement="auto"
                title="Generate new token"
                data-content="${TokenGenerateForm({
                  id: 'generateTokenButton',
                  csrfToken: resLocals.__csrf_token,
                }).toString()}"
                data-trigger="manual"
                onclick="$(this).popover('show')"
              >
                <i class="fa fa-plus" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">Generate new token</span>
              </button>
            </div>
            <div class="card-body">
              <p class="mb-0">You can generate tokens in order to access the PrairieLearn API.</p>
              ${newAccessTokens.length > 0
                ? html`
                    <div class="alert alert-primary mt-3" role="alert">
                      New access token created! Be sure to copy it now, as you won't be able to see
                      it later.
                    </div>
                    ${newAccessTokens.map(
                      (token) => html`
                        <div class="alert alert-success mb-0 new-access-token" role="alert">
                          ${token}
                        </div>
                      `,
                    )}
                  `
                : ''}
            </div>
            <ul class="list-group list-group-flush">
              ${accessTokens.length === 0
                ? html`
                    <li class="list-group-item">
                      <span class="text-muted"> You don't currently have any access tokens. </span>
                    </li>
                  `
                : accessTokens.map(
                    (token) => html`
                      <li class="list-group-item d-flex align-items-center">
                        <div class="d-flex flex-column mr-3">
                          <strong>${token.name}</strong>
                          <span class="text-muted">Created at ${token.created_at}</span>
                          <span class="text-muted">
                            ${token.last_used_at !== null
                              ? html`Last used at ${token.last_used_at}`
                              : 'Never used'}
                          </span>
                        </div>
                        <button
                          id="deleteTokenButton${token.id}"
                          type="button"
                          class="btn btn-outline-danger btn-sm ml-auto"
                          data-toggle="popover"
                          data-container="body"
                          data-html="true"
                          data-placement="auto"
                          title="Delete this token"
                          data-content="${TokenDeleteForm({
                            id: `deleteTokenButton${token.id}`,
                            token_id: token.id,
                            csrfToken: resLocals.__csrf_token,
                          }).toString()}"
                          data-trigger="manual"
                          onclick="$(this).popover('show')"
                        >
                          Delete
                        </button>
                      </li>
                    `,
                  )}
            </ul>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function TokenGenerateForm({ id, csrfToken }: { id: string; csrfToken: string }) {
  return html`
    <form name="generate-token-form" method="post">
      <input type="hidden" name="__action" value="token_generate" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="form-group">
        <label for="token_name">Name:</label>
        <input
          type="text"
          class="form-control"
          id="token_name"
          name="token_name"
          placeholder="My token"
        />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Generate token</button>
      </div>
    </form>
  `;
}

function TokenDeleteForm({
  token_id,
  id,
  csrfToken,
}: {
  token_id: string;
  id: string;
  csrfToken: string;
}) {
  return html`
    <form name="token-delete-form" method="POST">
      <input type="hidden" name="__action" value="token_delete" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="token_id" value="${token_id}" />
      <p>
        Once you delete this token, any applications using it will no longer be able to access the
        API. You cannot undo this action.
      </p>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-danger">Delete token</button>
      </div>
    </form>
  `;
}
