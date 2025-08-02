import { html } from '@prairielearn/html';

import type { AdministratorQuerySpecs } from '../../admin_queries/lib/util.js';
import { PageLayout } from '../../components/PageLayout.js';

export interface AdministratorQuery extends AdministratorQuerySpecs {
  error?: any;
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
                      ${query.error
                        ? html`<code>${query.filePrefix}</code>`
                        : html`
                            <a
                              href="${resLocals.urlPrefix}/administrator/query/${query.filePrefix}"
                            >
                              <code>${query.filePrefix}</code>
                            </a>
                          `}
                    </td>
                    <td>
                      ${query.error
                        ? html`<span class="text-danger">${query.error}</span>`
                        : query.description}
                    </td>
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
