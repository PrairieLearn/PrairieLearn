import { html } from '@prairielearn/html';

import type { AdministratorQuerySpecs } from '../../admin_queries/lib/util.js';
import { PageLayout } from '../../components/PageLayout.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export interface AdministratorQuery extends AdministratorQuerySpecs {
  error?: any;
  filePrefix: string;
}

export function AdministratorQueries({
  queries,
  resLocals,
}: {
  queries: AdministratorQuery[];
  resLocals: UntypedResLocals;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Administrator Queries',
    navContext: {
      type: 'administrator',
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
                      ${query.error || query.enabled === false
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
                        : query.enabled === false
                          ? html`
                              <span class="text-muted">${query.description}</span>
                              <span class="badge text-bg-info">Disabled</span>
                            `
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
