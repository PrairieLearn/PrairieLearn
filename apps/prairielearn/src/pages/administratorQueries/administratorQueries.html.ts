import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { AdministratorQuery } from './administratorQueries';

export function AdministratorQueries({
  queries,
  resLocals,
}: {
  queries: AdministratorQuery[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'queries',
        })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Queries</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <tbody>
                  ${queries.map(
                    (query) => html`
                      <tr>
                        <td>
                          <a href=${`${resLocals.urlPrefix}/administrator/query/${query.link}`}>
                            <code>${query.sqlFilename}</code>
                          </a>
                        </td>
                        <td>${query.description}</td>
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
