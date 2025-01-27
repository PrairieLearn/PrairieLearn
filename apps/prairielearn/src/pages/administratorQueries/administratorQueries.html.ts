import { z } from 'zod';

import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';

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
  return PageLayout({
    resLocals,
    pageTitle: 'Administrator Queries',
    navContext: {
      type: 'plain',
      page: 'admin',
      subPage: 'queries',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>Queries</h1>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Queries">
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
    `,
  });
}
