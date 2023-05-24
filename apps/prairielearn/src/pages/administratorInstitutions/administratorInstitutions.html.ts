import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export const InstitutionSchema = z.object({
  id: z.string(),
  short_name: z.string(),
  long_name: z.string(),
  display_timezone: z.string(),
  uid_regexp: z.string().nullable(),
  authn_providers: z.array(z.string()),
});
type Institution = z.infer<typeof InstitutionSchema>;

export function AdministratorInstitutions({
  institutions,
  resLocals,
}: {
  institutions: Institution[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
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
          navSubPage: 'courses',
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
                    (inst) => html`
                      <tr>
                        <td>
                          <a href="/pl/institution/${inst.id}/admin">${inst.short_name}</a>
                        </td>
                        <td>${inst.long_name}</td>
                        <td>${inst.display_timezone}</td>
                        <td><code>${inst.uid_regexp}</code></td>
                        <td>${inst.authn_providers.join(', ')}</td>
                      </tr>
                    `
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
