import { z } from 'zod';

import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';
import { UserSettingsPurchasesCard } from '../../ee/lib/billing/components/UserSettingsPurchasesCard.html.js';
import { type Purchase } from '../../ee/lib/billing/purchases.js';
import { IdSchema, type Institution, type User } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';

export const AccessTokenSchema = z.object({
  created_at: z.string(),
  id: IdSchema,
  last_used_at: z.string().nullable(),
  name: z.string(),
  token_hash: z.string(),
  token: z.string().nullable(),
});
type AccessToken = z.infer<typeof AccessTokenSchema>;

const ENHANCED_NAV_DISCUSSION_URL =
  'https://github.com/PrairieLearn/PrairieLearn/discussions/12230';

export function UserSettings({
  authn_user,
  authn_institution,
  authn_provider_name,
  accessTokens,
  newAccessTokens,
  purchases,
  isExamMode,
  showEnhancedNavigationToggle,
  enhancedNavigationEnabled,
  resLocals,
}: {
  authn_user: User;
  authn_institution: Institution;
  authn_provider_name: string;
  accessTokens: AccessToken[];
  newAccessTokens: string[];
  purchases: Purchase[];
  isExamMode: boolean;
  showEnhancedNavigationToggle: boolean;
  enhancedNavigationEnabled: boolean;
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'User Settings',
    navContext: {
      page: 'user_settings',
      type: 'plain',
    },
    headContent: html` ${compiledScriptTag('userSettingsClient.ts')} `,
    content: html`
      <h1 class="mb-4">Settings</h1>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h2>User profile</h2>
        </div>
        <table class="table table-sm two-column-description" aria-label="User profile information">
          <tbody>
            <tr>
              <th>UID</th>
              <td>${authn_user.uid}</td>
            </tr>
            <tr>
              <th>Name</th>
              <td>${authn_user.name}</td>
            </tr>
            <tr>
              <th>Unique Identifier (UIN)</th>
              <td>${authn_user.uin}</td>
            </tr>
            <tr>
              <th>Email</th>
              <td>${authn_user.email}</td>
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

      ${showEnhancedNavigationToggle
        ? html`
            <form method="POST">
              <div class="card mb-4">
                <div class="card-header bg-primary text-white d-flex align-items-center">
                  <h2>Feature preview</h2>
                </div>
                <ul class="list-group list-group-flush">
                  <li class="list-group-item">
                    <div class="form-check">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        name="enhanced_navigation"
                        value="1"
                        id="enhanced_navigation_toggle"
                        ${enhancedNavigationEnabled ? 'checked' : ''}
                      />
                      <label
                        class="form-check-label d-flex align-items-center"
                        for="enhanced_navigation_toggle"
                      >
                        Enhanced navigation
                      </label>
                      <div class="small text-muted">
                        Try a new navigation experience for instructors that makes accessing your
                        course simpler, faster, and more intuitive.
                        <a href="${ENHANCED_NAV_DISCUSSION_URL}" target="_blank">
                          Share your feedback
                        </a>
                        to help us improve the new design.
                      </div>
                    </div>

                    <div
                      id="enhanced_navigation_feedback"
                      class="alert alert-info mt-2 mb-2 d-none"
                    >
                      <div class="mb-2 text-dark">
                        <strong>Turning off enhanced navigation?</strong> We'd love to know what's
                        not working for you.
                      </div>
                      <a
                        href="${ENHANCED_NAV_DISCUSSION_URL}"
                        target="_blank"
                        class="btn btn-sm btn-outline-dark"
                      >
                        Share feedback on GitHub Discussions
                        <i class="bi bi-box-arrow-up-right ms-1"></i>
                      </a>
                    </div>
                  </li>
                </ul>

                <div class="card-footer">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button
                    type="submit"
                    class="btn btn-sm btn-primary"
                    name="__action"
                    value="update_features"
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </form>
          `
        : ''}
      ${isEnterprise() ? UserSettingsPurchasesCard({ purchases }) : ''}

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h2>Personal access tokens</h2>
          ${!isExamMode
            ? html`
                <button
                  type="button"
                  class="btn btn-light btn-sm ms-auto"
                  data-bs-toggle="popover"
                  data-bs-container="body"
                  data-bs-html="true"
                  data-bs-placement="auto"
                  data-bs-title="Generate new token"
                  data-bs-content="${TokenGenerateForm({
                    csrfToken: resLocals.__csrf_token,
                  }).toString()}"
                  data-testid="generate-token-button"
                >
                  <i class="fa fa-plus" aria-hidden="true"></i>
                  <span class="d-none d-sm-inline">Generate new token</span>
                </button>
              `
            : ''}
        </div>
        ${newAccessTokens.length > 0
          ? html`
              <div class="card-body">
                <div class="alert alert-primary" role="alert">
                  New access token created! Be sure to copy it now, as you won't be able to see it
                  later.
                </div>
                ${newAccessTokens.map(
                  (token) => html`
                    <div class="alert alert-success mb-0 new-access-token" role="alert">
                      ${token}
                    </div>
                  `,
                )}
              </div>
            `
          : ''}
        <ul class="list-group list-group-flush">
          ${TokenList({
            accessTokens,
            isExamMode,
            resLocals,
          })}
        </ul>

        <div class="card-footer small">
          Access tokens can be used to access the PrairieLearn API. Be sure to keep them secure.
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h2>Browser configuration</h2>
        </div>
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
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick="localStorage.removeItem('MathJax-Menu-Settings');alert('MathJax menu settings have been reset');"
          >
            Reset MathJax menu settings
          </button>
        </div>
      </div>
    `,
  });
}

function TokenList({
  accessTokens,
  isExamMode,
  resLocals,
}: {
  accessTokens: AccessToken[];
  isExamMode: boolean;
  resLocals: Record<string, any>;
}) {
  if (isExamMode) {
    return html`
      <li class="list-group-item">
        <span class="text-muted">Access tokens are not available in exam mode.</span>
      </li>
    `;
  }

  if (accessTokens.length === 0) {
    return html`
      <li class="list-group-item">
        <span class="text-muted"> You don't currently have any access tokens. </span>
      </li>
    `;
  }

  return accessTokens.map(
    (token) => html`
      <li class="list-group-item d-flex align-items-center">
        <div class="d-flex flex-column me-3">
          <strong>${token.name}</strong>
          <span class="text-muted">Created at ${token.created_at}</span>
          <span class="text-muted">
            ${token.last_used_at !== null ? html`Last used at ${token.last_used_at}` : 'Never used'}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-outline-danger btn-sm ms-auto"
          data-bs-toggle="popover"
          data-bs-container="body"
          data-bs-html="true"
          data-bs-placement="auto"
          data-bs-title="Delete this token"
          data-bs-content="${TokenDeleteForm({
            token_id: token.id,
            csrfToken: resLocals.__csrf_token,
          }).toString()}"
        >
          Delete
        </button>
      </li>
    `,
  );
}

function TokenGenerateForm({ csrfToken }: { csrfToken: string }) {
  return html`
    <form name="generate-token-form" method="post">
      <input type="hidden" name="__action" value="token_generate" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="mb-3">
        <label class="form-label" for="token_name">Name:</label>
        <input
          type="text"
          class="form-control"
          id="token_name"
          name="token_name"
          placeholder="My token"
          autocomplete="off"
        />
      </div>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Generate token</button>
      </div>
    </form>
  `;
}

function TokenDeleteForm({ token_id, csrfToken }: { token_id: string; csrfToken: string }) {
  return html`
    <form name="token-delete-form" method="POST">
      <input type="hidden" name="__action" value="token_delete" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="token_id" value="${token_id}" />
      <p>
        Once you delete this token, any applications using it will no longer be able to access the
        API. You cannot undo this action.
      </p>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-danger">Delete token</button>
      </div>
    </form>
  `;
}
