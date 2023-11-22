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
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
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
                To change institutions, edit the <strong><tt>institutions</tt></strong> table. To
                change the allowed authentication providers, edit the
                <strong><tt>institution_authn_providers</tt></strong> table.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
