import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';

export const AdministratorQueryJsonParamsSchema = z.object({
  name: z.string(),
  description: z.string(),
  default: z.string().optional(),
  comment: z.string().optional(),
});
export type AdministratorQueryJsonParams = z.infer<typeof AdministratorQueryJsonParamsSchema>;

export const AdministratorQueryJsonSchema = z.object({
  description: z.string(),
  resultFormats: z.record(z.enum(['pre'])).optional(),
  comment: z.string().optional(),
  params: z.array(AdministratorQueryJsonParamsSchema).optional(),
});
export type AdministratorQueryJson = z.infer<typeof AdministratorQueryJsonSchema>;

interface AdministratorQuery extends AdministratorQueryJson {
  sqlFilename: string;
  link: string;
}

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
                          <a href="${`${resLocals.urlPrefix}/administrator/query/${query.link}`}">
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
