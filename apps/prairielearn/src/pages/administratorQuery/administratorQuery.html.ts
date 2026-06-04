import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { type AdministratorQuerySpecs } from '../../admin_queries/lib/util.js';
import { PageLayout } from '../../components/PageLayout.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';
import { type QueryRun, QueryRunSchema } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export const QueryRunRowSchema = QueryRunSchema.extend({
  user_name: z.string().nullable(),
  user_uid: z.string().nullable(),
});
type QueryRunRow = z.infer<typeof QueryRunRowSchema>;

export function AdministratorQuery({
  resLocals,
  query_run_id,
  query_run,
  queryFilename,
  info,
  recent_query_runs,
}: {
  resLocals: ResLocalsForPage<'plain'>;
  query_run_id: string | null;
  query_run: QueryRun | null;
  queryFilename: string;
  info: AdministratorQuerySpecs;
  recent_query_runs: QueryRunRow[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: queryFilename,
    navContext: {
      type: 'administrator',
      page: 'admin',
      subPage: 'queries',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
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
    `,
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Query: <span class="font-monospace">${queryFilename}</span></h1>
          <span class="ms-3">&mdash;</span>
          <span class="ms-3">${info.description}</span>
        </div>

        <div class="card-body">
          <form method="POST">
            ${info.params
              ? info.params.map(
                  (param) => html`
                    <div class="mb-3">
                      <label class="form-label" for="param-${param.name}">${param.name}</label>
                      <input
                        class="form-control"
                        type="text"
                        id="param-${param.name}"
                        aria-describedby="param-${param.name}-help"
                        name="${param.name}"
                        autocomplete="off"
                        ${query_run?.params?.[param.name]
                          ? html`value="${query_run.params[param.name]}"`
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
                Query ran at: ${formatDate(query_run.date, 'UTC')}
                ${query_run.result != null
                  ? html`
                      <div class="ms-auto">
                        <span class="me-2" data-testid="row-count">
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
                              ${formatDate(run.date, 'UTC')}
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
    `,
    postContent: html`
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
    `,
  });
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
  return true;
}

function renderHeader(columns: string[], col: string) {
  if (!shouldRenderColumn(columns, col)) return '';
  return html`<th>${col}</th>`;
}

function renderCell(row: any, col: string, columns: string[], info: AdministratorQuerySpecs) {
  if (!shouldRenderColumn(columns, col)) return '';

  if (col === 'course' && 'course_id' in row) {
    return html`
      <td>
        <a href="/pl/course/${row.course_id}">${row[col]}</a>
      </td>
    `;
  } else if (col === 'course_instance' && 'course_instance_id' in row) {
    return html`
      <td>
        <a href="/pl/course_instance/${row.course_instance_id}">${row[col]}</a>
      </td>
    `;
  } else if (col === 'assessment' && 'assessment_id' in row && 'course_instance_id' in row) {
    return html`
      <td>
        <a
          href="/pl/course_instance/${row.course_instance_id}/instructor/assessment/${row.assessment_id}"
        >
          ${row[col]}
        </a>
      </td>
    `;
  }

  if (row[col] == null) {
    return html`<td></td>`;
  }

  if (info.resultFormats?.[col] === 'pre') {
    return html`
      <td>
        <pre>${row[col]}</pre>
      </td>
    `;
  } else if (typeof row[col] === 'object') {
    return html`
      <td>
        <code>${JSON.stringify(row[col])}</code>
      </td>
    `;
  }

  return html`<td>${row[col]}</td>`;
}
