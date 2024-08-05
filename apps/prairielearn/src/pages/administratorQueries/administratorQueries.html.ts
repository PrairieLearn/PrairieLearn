import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../components/HeadContents.html.js';

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
type AdministratorQueryJson = z.infer<typeof AdministratorQueryJsonSchema>;

export interface AdministratorQuery extends AdministratorQueryJson {
  filePrefix: string;
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
        ${HeadContents({ resLocals, pageTitle: 'Administrator Queries' })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar') %>", {
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
                          <a href="${resLocals.urlPrefix}/administrator/query/${query.filePrefix}">
                            <code>${query.filePrefix}</code>
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
