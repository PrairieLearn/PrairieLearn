import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { AdministratorQueryResultSchema } from '../../admin_queries/util.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import { type QueryRun, QueryRunSchema } from '../../lib/db-types.js';

export const AdministratorQueryRunParamsSchema = z.object({
  name: z.string(),
  sql: z.string(),
  params: z.record(z.any()),
  authn_user_id: z.string(),
  error: z.string().optional().nullable(),
  result: AdministratorQueryResultSchema.nullable(),
  formatted_date: z.string().optional().nullable(),
});

export const AdministratorQuerySchema = z.object({
  description: z.string(),
  resultFormats: z.any().optional(),
  comment: z.any().optional(),
  params: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        default: z.string().optional(),
        comment: z.string().optional(),
      }),
    )
    .optional(),
  sqlFilename: z.string().optional(),
  link: z.string().optional(),
});
type AdministratorQuery = z.infer<typeof AdministratorQuerySchema>;

export const QueryRunRowSchema = QueryRunSchema.extend({
  user_name: z.string().nullable(),
  user_uid: z.string().nullable(),
});
export type QueryRunRow = z.infer<typeof QueryRunRowSchema>;

export function AdministratorQuery({
  resLocals,
  query_run_id,
  query_run,
  queryFilename,
  info,
  recent_query_runs,
}: {
  resLocals: Record<string, any>;
  query_run_id: string | null;
  query_run: QueryRun | null;
  queryFilename: string;
  info: AdministratorQuery;
  recent_query_runs: QueryRunRow[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: queryFilename })}
        <link href="${nodeModulesAssetPath('highlight.js/styles/default.css')}" rel="stylesheet" />
        <link
          href="${nodeModulesAssetPath('tablesorter/dist/css/theme.bootstrap.min.css')}"
          rel="stylesheet"
        />
        <script src="${nodeModulesAssetPath(
            'tablesorter/dist/js/jquery.tablesorter.min.js',
          )}"></script>
        <script src="${nodeModulesAssetPath(
            'tablesorter/dist/js/jquery.tablesorter.widgets.min.js',
          )}"></script>
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'queries' })}

        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Query: <span class="text-monospace">${queryFilename}</span></h1>
              <span class="ml-3">&mdash;</span>
              <span class="ml-3">${info.description}</span>
            </div>

            <div class="card-body">
              <form name="run-query-form" method="POST">
                ${info.params
                  ? info.params.map(
                      (param) => html`
                        <div class="form-group">
                          <label for="param-${param.name}">${param.name}</label>
                          <input
                            class="form-control"
                            type="text"
                            id="param-${param.name}"
                            aria-describedby="param-${param.name}-help"
                            name="${param.name}"
                            autocomplete="off"
                            ${query_run?.params?.[param.name]
                              ? html`value="${query_run?.params[param.name]}"`
                              : html`value="${param.default ?? ''}"`}
                          />

                          <small id="param-${param.name}-help" class="form-text text-muted">
                            ${param.description}
                          </small>
                        </div>
                      `,
                    )
                  : null}
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <button type="submit" class="btn btn-primary">
                  <i class="fas fa-play"></i>
                  Run query ${query_run ? 'again' : null}
                </button>
              </form>
            </div>

            ${query_run
              ? html`
                  <div class="card-body d-flex align-items-center p-2 bg-secondary text-white">
                    Query ran at: ${query_run.date ? formatDate(query_run.date, 'UTC') : 'unknown'}
                    ${query_run?.result != null
                      ? html`
                          <div class="ml-auto">
                            <span class="mr-2" data-testid="row-count">
                              ${query_run.result.rows?.length ?? 0}
                              ${query_run.result.rows?.length === 1 ? 'row' : 'rows'}
                            </span>
                            <a
                              href="${`?query_run_id=${query_run_id}&format=json`}"
                              class="btn btn-sm btn-light"
                            >
                              <i class="fas fa-download" aria-hidden="true"></i> JSON
                            </a>
                            <a
                              href="${`?query_run_id=${query_run_id}&format=csv`}"
                              class="btn btn-sm btn-light"
                            >
                              <i class="fas fa-download" aria-hidden="true"></i> CSV
                            </a>
                          </div>
                        `
                      : ''}
                  </div>
                `
              : null}
            ${query_run?.error != null
              ? html` <p class="text-danger m-2">${query_run.error}</p> `
              : null}
            ${query_run?.result != null
              ? html`
                  <div class="table-responsive">
                    <table
                      class="table table-sm table-hover table-striped tablesorter"
                      aria-label="Query results"
                      data-testid="results-table"
                    >
                      <thead>
                        <tr>
                          ${query_run.result.columns?.map((col: string) =>
                            renderHeader(query_run.result?.columns, col),
                          )}
                        </tr>
                      </thead>

                      <tbody>
                        ${query_run.result.rows?.map(
                          (row: any) => html`
                            <tr>
                              ${query_run.result?.columns?.map((col: string) =>
                                renderCell(row, col, query_run.result?.columns, info),
                              )}
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  </div>
                `
              : null}
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              Recent query runs
            </div>
            <div class="table-responsive">
              ${recent_query_runs.length > 0
                ? html`
                    <table class="table table-sm" aria-label="Recent query runs">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Params</th>
                          <th>User name</th>
                          <th>User UID</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${recent_query_runs.map(
                          (run) => html`
                            <tr>
                              <td>
                                <a href="${`?query_run_id=${run.id}`}">
                                  ${run.date ? formatDate(run.date, 'UTC') : html`&mdash;`}
                                </a>
                              </td>
                              <td>
                                <pre class="mb-0">${JSON.stringify(run.params)}</pre>
                              </td>
                              <td>${run.user_name}</td>
                              <td>${run.user_uid}</td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  `
                : html`
                    <div class="card-body">
                      <div class="text-center text-muted">No recent runs found</div>
                    </div>
                  `}
            </div>
          </div>
        </main>
        <script>
          $(function () {
            $('.tablesorter').tablesorter({
              theme: 'bootstrap',
              widthFixed: true,
              headerTemplate: '{content} {icon}',
              widgets: ['uitheme', 'zebra'],
              widgetOptions: {
                zebra: ['even', 'odd'],
              },
            });
          });
        </script>
      </body>
    </html>
  `.toString();
}

function shouldRenderColumn(columns: string[], col: string) {
  if (col === 'course_id' && columns.includes('course')) {
    return false;
  }
  if (col === 'course_instance_id' && columns.includes('course_instance')) {
    return false;
  }
  if (
    col === 'assessment_id' &&
    columns.includes('assessment') &&
    columns.includes('course_instance_id')
  ) {
    return false;
  }
  if (/^_sortval_/.test(col)) {
    return false;
  }
  return true;
}

function renderHeader(columns: string[], col: string) {
  if (!shouldRenderColumn(columns, col)) return '';
  return html`<th>${col}</th>`;
}

function renderCell(row: any, col: string, columns: string[], info: AdministratorQuery) {
  if (!shouldRenderColumn(columns, col)) return '';
  const tdAttributes = `_sortval_${col}` in row ? html`data-text="${row[`_sortval_${col}`]}"` : '';

  if (col === 'course' && 'course_id' in row) {
    return html`
      <td ${tdAttributes}>
        <a href="${config.urlPrefix}/course/${row['course_id']}">${row[col]}</a>
      </td>
    `;
  } else if (col === 'course_instance' && 'course_instance_id' in row) {
    return html`
      <td ${tdAttributes}>
        <a href="${config.urlPrefix}/course_instance/${row['course_instance_id']}">${row[col]}</a>
      </td>
    `;
  } else if (col === 'assessment' && 'assessment_id' in row && 'course_instance_id' in row) {
    return html`
      <td ${tdAttributes}>
        <a
          href="${config.urlPrefix}/course_instance/${row[
            'course_instance_id'
          ]}/instructor/assessment/${row['assessment_id']}"
        >
          ${row[col]}
        </a>
      </td>
    `;
  }

  if (row[col] == null) {
    return html`<td ${tdAttributes}></td>`;
  }

  if (info.resultFormats?.[col] === 'pre') {
    return html`
      <td ${tdAttributes}>
        <pre>${row[col]}</pre>
      </td>
    `;
  } else if (typeof row[col] === 'object') {
    return html`
      <td ${tdAttributes}>
        <code>${JSON.stringify(row[col])}</code>
      </td>
    `;
  }

  return html`<td ${tdAttributes}>${row[col]}</td>`;
}
