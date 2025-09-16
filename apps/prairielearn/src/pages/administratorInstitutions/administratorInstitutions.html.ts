import { z } from 'zod';

import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { type AuthnProvider, InstitutionSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import { type Timezone, formatTimezone } from '../../lib/timezone.shared.js';

export const InstitutionRowSchema = z.object({
  institution: InstitutionSchema,
  authn_providers: z.array(z.string()),
});
type InstitutionRow = z.infer<typeof InstitutionRowSchema>;

export function AdministratorInstitutions({
  institutions,
  availableTimezones,
  supportedAuthenticationProviders,
  resLocals,
}: {
  institutions: InstitutionRow[];
  availableTimezones: Timezone[];
  supportedAuthenticationProviders: AuthnProvider[];
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Institutions',
    navContext: {
      type: 'plain',
      page: 'admin',
      subPage: 'institutions',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div id="institutions" class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Institutions</h1>
          <button
            type="button"
            class="btn btn-sm btn-light ms-auto"
            data-bs-toggle="modal"
            data-bs-target="#add-institution-modal"
          >
            <i class="fas fa-plus"></i>
            <span class="d-none d-sm-inline">Add institution</span>
          </button>
        </div>
        ${Modal({
          title: 'Add Institution',
          id: 'add-institution-modal',
          body: html`
            <input type="hidden" name="__action" value="add_institution" />
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <div class="mb-3">
              <label class="form-label" for="short_name">Short name</label>
              <input
                type="text"
                class="form-control"
                id="short_name"
                name="short_name"
                placeholder="Short name"
                required
              />
              <small id="short_name_help" class="form-text text-muted">
                An abbreviation or short name, e.g. "illinois.edu" or "ubc.ca". Usually this should
                be the institution's domain.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="long_name">Long name</label>
              <input
                type="text"
                class="form-control"
                id="long_name"
                name="long_name"
                placeholder="Long name"
                required
              />
              <small id="long_name_help" class="form-text text-muted">
                Use the full name of the university, e.g. "University of Illinois Urbana-Champaign".
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="display_timezone">Timezone</label>
              <select class="form-select" id="display_timezone" name="display_timezone" required>
                <option value="" selected disabled hidden>Timezone</option>
                ${availableTimezones.map(
                  (tz, i) => html`
                    <option value="${tz.name}" id="timezone-${i}">${formatTimezone(tz)}</option>
                  `,
                )}
              </select>
              <small id="display_timezone_help" class="form-text text-muted">
                The allowable timezones are from the
                <a
                  href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                  target="_blank"
                  rel="noreferrer"
                  >tz database</a
                >. It's best to use a city-based timezone that has the same times as the
                institution, e.g. "America/Chicago".
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="uid_regexp">UID regexp</label>
              <input
                type="text"
                class="form-control"
                id="uid_regexp"
                name="uid_regexp"
                placeholder="UID regexp"
              />
              <small id="uid_regexp_help" class="form-text text-muted">
                Should match the non-username part of user UIDs, e.g. <code>@example\\.com$</code>.
                This should be set for institution-based access restrictions to work correctly.
              </small>
            </div>
            ${supportedAuthenticationProviders.length > 0
              ? html`
                  <div class="mb-3">
                    <label class="form-label">Authentication providers</label>
                    <div class="mb-2">
                      ${supportedAuthenticationProviders.map((provider) => {
                        // Default Google and Azure/Microsoft to checked
                        const isDefaultChecked =
                          provider.name === 'Google' || provider.name === 'Azure';

                        return html`
                          <div class="form-check">
                            <input
                              class="form-check-input"
                              type="checkbox"
                              value="${provider.id}"
                              id="authn-provider-${provider.id}"
                              name="enabled_authn_provider_ids"
                              ${isDefaultChecked ? 'checked' : ''}
                            />
                            <label class="form-check-label" for="authn-provider-${provider.id}">
                              ${provider.name}
                            </label>
                          </div>
                        `;
                      })}
                    </div>
                    <small class="form-text text-muted">
                      Select which authentication methods users from this institution can use to log
                      in. Google and Azure (Microsoft) are good defaults for most institutions. You
                      can configure authentication providers after the institution is created.
                    </small>
                  </div>
                `
              : html`
                  <div class="alert alert-info">
                    Neither Google nor Microsoft authentication is configured for this PrairieLearn
                    installation. Additional SSO authentication providers can be configured later.
                  </div>
                `}
          `,
          footer: html`
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Add institution</button>
          `,
        })}
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Institutions">
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
                            <a href="/pl/administrator/institution/${institution.id}">
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
      </div>
    `,
  });
}
