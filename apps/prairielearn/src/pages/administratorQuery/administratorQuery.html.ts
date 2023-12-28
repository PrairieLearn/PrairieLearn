import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';

import { nodeModulesAssetPath } from '../../lib/assets';

export const AdministratorQueryResultSchema = z.object({
  rows: z.array(z.record(z.any())),
  rowCount: z.number(),
  columns: z.array(z.string()),
});
export type AdministratorQueryResult = z.infer<typeof AdministratorQueryResultSchema>;

export const AdministratorQueryRunParamsSchema = z.object({
  name: z.string(),
  sql: z.string(),
  params: z.record(z.any()),
  authn_user_id: z.string(),
  error: z.string().optional().nullable(),
  result: AdministratorQueryResultSchema.nullable(),
  formatted_date: z.string().optional().nullable(),
});
export type AdministratorQueryRunParams = z.infer<typeof AdministratorQueryRunParamsSchema>;

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

export const AdministratorQueryQueryRunSchema = z.object({
  formatted_date: z.string().optional(),
  sql: z.string(),
  params: z.record(z.any()),
  error: z.string().nullable(),
  result: AdministratorQueryResultSchema.nullable(),
  authn_user_id: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  user_name: z.string().optional(),
  user_uid: z.string().optional(),
});
export type AdministratorQueryQueryRun = z.infer<typeof AdministratorQueryQueryRunSchema>;

export function AdministratorQuery({
  resLocals,
  query_run_id,
  query_run,
  sqlFilename,
  info,
  sqlHighlighted,
  recent_query_runs,
}: {
  resLocals: Record<string, any>;
  query_run_id: string | null;
  query_run: AdministratorQueryQueryRun | null;
  sqlFilename: string;
  info: AdministratorQuery;
  sqlHighlighted: string;
  recent_query_runs: AdministratorQueryQueryRun[];
}) {
  function renderHeader(columns, col) {
    const row = {};
    columns.forEach((c) => {
      row[c] = true;
    });

    if (col === 'course_id' && 'course' in row) {
      return '';
    } else if (col === 'course_instance_id' && 'course_instance' in row) {
      return '';
    } else if (col === 'assessment_id' && 'assessment' in row && 'course_instance_id' in row) {
      return '';
    } else if (/^_sortval_/.test(col)) {
      return '';
    } else {
      return html`<th>${col}</th>`;
    }
  }

  function render(row, col) {
    const tdAttributes =
      `_sortval_${col}` in row ? html`data-text="${row['_sortval_' + col]}"` : html``;

    if (col === 'course_id' && 'course' in row) {
      null;
    } else if (col === 'course' && 'course_id' in row) {
      return html`
        <td ${tdAttributes}>
          <a href="${resLocals.urlPrefix}/course/${row['course_id']}">${row[col]}</a>
        </td>
      `;
    } else if (col === 'course_instance_id' && 'course_instance' in row) {
      null;
    } else if (col === 'course_instance' && 'course_instance_id' in row) {
      return html`
        <td ${tdAttributes}>
          <a href="${resLocals.urlPrefix}/course_instance/${row['course_instance_id']}">
            ${row[col]}
          </a>
        </td>
      `;
    } else if (col === 'assessment_id' && 'assessment' in row && 'course_instance_id' in row) {
      null;
    } else if (col === 'assessment' && 'assessment_id' in row && 'course_instance_id' in row) {
      return html`
        <td ${tdAttributes}>
          <a
            href="${resLocals.urlPrefix}/course_instance/${row[
              'course_instance_id'
            ]}/instructor/assessment/${row['assessment_id']}"
          >
            ${row[col]}
          </a>
        </td>
      `;
    } else if (/^_sortval_/.test(col)) {
      null;
    } else if (row[col] == null) {
      return html`<td ${tdAttributes}></td>`;
    } else if (info.resultFormats && info.resultFormats[col] === 'pre') {
      return html`
        <td ${tdAttributes}>
          <pre>${row[col]}</pre>
        </td>
      `;
    } else if (typeof row[col] == 'object') {
      return html`
        <td ${tdAttributes}>
          <code>${JSON.stringify(row[col])}</code>
        </td>
      `;
    } else {
      return html` <td ${tdAttributes}>${row[col]}</td> `;
    }
  }

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head') %>", resLocals)}
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
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'queries',
        })}

        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <span class="font-weight-bold text-monospace">${sqlFilename}</span>
              <button
                class="btn btn-xs btn-light ml-2 my-n2"
                type="button"
                data-toggle="collapse"
                data-target="#sql-query"
                aria-expanded="false"
                aria-controls="sql-query"
              >
                Show SQL <i class="fas fa-caret-down"></i>
              </button>
              <span class="ml-3">&mdash;</span>
              <span class="ml-3">${info.description}</span>
            </div>

            <div id="sql-query" class="collapse">
              <pre class="m-0 p-2 bg-light border-bottom"><code class="sql">${unsafeHtml(
                sqlHighlighted,
              )}</code></pre>
            </div>
            <div class="card-body">
              <form name="run-query-form" method="POST">
                ${info.params
                  ? info.params.map(
                      (param) => html`
                        <div class="form-group">
                          <label for="${`param-${param.name}`}">${param.name}</label>
                          <input
                            class="form-control"
                            type="text"
                            id="${`param-${param.name}`}"
                            aria-describedby="${`param-${param.name}-help`}"
                            name="${param.name}"
                            autocomplete="off"
                            ${query_run?.params?.[param.name]
                              ? html`value="${query_run?.params[param.name]}"`
                              : html`value="${param.default ?? ''}"`}
                          />

                          <small id="${`param-${param.name}-help`}" class="form-text text-muted">
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
                    Query ran at: ${query_run?.formatted_date}
                    ${query_run?.result != null
                      ? html`
                          <div class="ml-auto">
                            <span class="mr-2 test-suite-row-count">
                              ${query_run.result.rowCount}
                              ${query_run.result.rowCount === 1 ? 'row' : 'rows'}
                            </span>
                            <a
                              href="${`?query_run_id=${query_run_id}&format=json`}"
                              role="button"
                              class="btn btn-sm btn-light"
                            >
                              <i class="fas fa-download" aria-hidden="true"></i> JSON
                            </a>
                            <a
                              href="${`?query_run_id=${query_run_id}&format=csv`}"
                              role="button"
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
                    <table class="table table-sm table-hover table-striped tablesorter">
                      <thead>
                        <tr>
                          ${query_run.result.columns?.map((col) =>
                            renderHeader(query_run.result?.columns, col),
                          )}
                        </tr>
                      </thead>

                      <tbody>
                        ${query_run.result.rows?.map(
                          (row) => html`
                            <tr>
                              ${query_run.result?.columns?.map((col) => render(row, col))}
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
                    <table class="table table-sm">
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
                                <a href="${`?query_run_id=${run.id}`}"> ${run.formatted_date} </a>
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
