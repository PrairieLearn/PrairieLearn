import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { InstitutionSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import { type Timezone, formatTimezone } from '../../lib/timezones.js';

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
  availableTimezones: Timezone[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Institutions' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'institutions' })}
        <main id="content" class="container-fluid">
          <div id="institutions" class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Institutions</h1>
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
            ${Modal({
              title: 'Add Institution',
              id: 'add-institution-modal',
              body: html`
                <input type="hidden" name="__action" value="add_institution" />
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
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
                  <select class="custom-select" id="display_timezone" name="display_timezone">
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
                    Should match the non-username part of students' UIDs. E.g., @example\\.com$.
                  </small>
                </div>
              `,
              footer: html`
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
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
        </main>
      </body>
    </html>
  `.toString();
}
