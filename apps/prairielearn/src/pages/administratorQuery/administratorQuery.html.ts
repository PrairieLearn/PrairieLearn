import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { nodeModulesAssetPath } from '../../lib/assets';

export interface AdministratorQueryRunParams {
  name: string;
  sql: string;
  params: string;
  authn_user_id: string;
  error: string | null;
  result: AdministratorQueryResult | null;
  formatted_date: string | null;
}

export interface AdministratorQueryResult {
  rows: any[];
  columns: string[];
  rowCount: number;
}

export interface AdministratorQuery {
  description: string;
  resultFormats: any | null;
  comment: any | null;
  params: {
    name: string;
    description: string;
    default: string | null;
  }[];
  sqlFilename: string;
  link: string;
}

export function AdministratorQuery({
  resLocals,
  has_query_run,
  query_run_id,
  formatted_date,
  params,
  error,
  result,
  sqlFilename,
  info,
}: {
  resLocals: Record<string, any>;
  has_query_run: boolean;
  query_run_id: string | null;
  formatted_date: string | null;
  params: AdministratorQueryRunParams | null;
  error: string | null;
  result: AdministratorQueryResult | null;
  sqlFilename: string;
  info;
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
          <a href="${`${resLocals.urlPrefix}/course/${row['course_id']}`}">${row[col]}</a>
        </td>
      `;
    } else if (col === 'course_instance_id' && 'course_instance' in row) {
      null;
    } else if (col === 'course_instance' && 'course_instance_id' in row) {
      return html`
        <td ${tdAttributes}>
          <a href="${`${resLocals.urlPrefix}/course_instance/${row['course_instance_id']}`}"
            >${row[col]}</a
          >
        </td>
      `;
    } else if (col === 'assessment_id' && 'assessment' in row && 'course_instance_id' in row) {
      null;
    } else if (col === 'assessment' && 'assessment_id' in row && 'course_instance_id' in row) {
      return html`
        <td ${tdAttributes}>
          <a
            href="${`${resLocals.urlPrefix}/course_instance/${row['course_instance_id']}/instructor/assessment/${row['assessment_id']}`}"
            >${row[col]}</a
          >
        </td>
      `;
    } else if (/^_sortval_/.test(col)) {
      null;
    } else if (row[col] == null) {
      return html` <td ${tdAttributes}></td> `;
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
                Show SQL<i class="fas fa-caret-down"></i>
              </button>
              <span class="ml-3">&mdash;</span>
              <span class="ml-3">${info.description}</span>
            </div>

            <div id="sql-query" class="collapse">
              <pre class="m-0 p-2 bg-light border-bottom"><code class="sql">${unsafeHtml(
                resLocals.sqlHighlighted,
              )}</code></pre>
            </div>
            <div class="card-body">
              <form name="run-query-form" method="POST">
                ${info.params
                  ? info.params.map((param) => {
                      return html`
                        <div class="form-group">
                          <label for="${`param-${param.name}`}">${param.name}</label>
                          <input
                            class="form-control"
                            type="text"
                            id="${`param-${param.name}`}"
                            aria-describedby="${`param-${param.name}-help`}"
                            name="${param.name}"
                            autocomplete="off"
                            ${params?.[param.name]
                              ? html`value="${params[param.name]}"`
                              : html`value="${param.default ?? ''}"`}
                          />

                          <small id="${`param-${param.name}-help`}" class="form-text text-muted"
                            >${param.description}</small
                          >
                        </div>
                      `;
                    })
                  : null}
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <button type="submit" class="btn btn-primary">
                  <i class="fas fa-play"></i>
                  Run query ${has_query_run ? 'again' : null}
                </button>
              </form>
            </div>

            ${has_query_run
              ? html`
                  <div class="card-body d-flex align-items-center p-2 bg-secondary text-white">
                    Query ran at: ${formatted_date}
                    ${result != null &&
                    html`
                      <div class="ml-auto">
                        <span class="mr-2 test-suite-row-count">
                          ${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}
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
                    `}
                  </div>
                `
              : null}
            ${error != null ? html` <p class="text-danger m-2">${error}</p> ` : null}
            ${result != null
              ? html`
                  <div class="table-responsive">
                    <table class="table table-sm table-hover table-striped tablesorter">
                      <thead>
                        <tr>
                          ${result.columns.map((col) => {
                            return html` ${renderHeader(result.columns, col)} `;
                          })}
                        </tr>
                      </thead>

                      <tbody>
                        ${result.rows.map((row) => {
                          return html`
                            <tr>
                              ${result.columns.map((col) => {
                                return html` ${render(row, col)}`;
                              })}
                            </tr>
                          `;
                        })}
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
              ${resLocals.recent_query_runs.length > 0
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
                        ${resLocals.recent_query_runs.map((run) => {
                          return html`
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
                          `;
                        })}
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
      </body>
    </html>

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
  `.toString();
}
