// @ts-check
const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

/**
 * @typedef {Object} AdministratorBatchedMigrationsProps
 * @property {import('@prairielearn/migrations').BatchedMigrationRow[]} batchedMigrations
 * @property {Record<string, any>} resLocals
 */

/**
 * @typedef {Object} AdministratorBatchedMigrationProps
 * @property {import('@prairielearn/migrations').BatchedMigrationRow} batchedMigration
 * @property {import('@prairielearn/migrations').BatchedMigrationJobRow[]} recentSucceededJobs
 * @property {import('@prairielearn/migrations').BatchedMigrationJobRow[]} recentFailedJobs
 * @property {Record<string, any>} resLocals
 */

/**
 * @typedef {Object} MigrationJobsCardProps
 * @property {string} title
 * @property {import('@prairielearn/migrations').BatchedMigrationJobRow[]} jobs
 * @property {string} emptyText
 */

/**
 * @param {AdministratorBatchedMigrationsProps} props
 * @returns {string}
 */
function AdministratorBatchedMigrations({ batchedMigrations, resLocals }) {
  const hasBatchedMigrations = batchedMigrations.length > 0;
  return html`
    <!DOCTYPE html>
    <html>
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'batchedMigrations',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <span class="mr-auto">Batched migrations</span>
            </div>
            ${hasBatchedMigrations
              ? html`<div class="list-group list-group-flush">
                  ${batchedMigrations.map((migration) => {
                    return html`
                      <div class="list-group-item d-flex align-items-center">
                        <a
                          href="${resLocals.urlPrefix}/administrator/batchedMigrations/${migration.id}"
                          class="mr-auto"
                        >
                          ${migration.filename}
                        </a>
                        ${MigrationStatusBadge(migration.status)}
                      </div>
                    `;
                  })}
                </div>`
              : html`<div class="card-body text-center text-secondary">No batched migrations</div>`}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

/**
 * @param {AdministratorBatchedMigrationProps} props
 * @returns {string}
 */
function AdministratorBatchedMigration({
  batchedMigration,
  recentSucceededJobs,
  recentFailedJobs,
  resLocals,
}) {
  return html`
    <!DOCTYPE html>
    <html>
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'batchedMigrations',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <span class="mr-auto">Migration details</span>
            </div>
            <table class="table table-sm two-column-description">
              <tbody>
                <tr>
                  <th>Filename</th>
                  <td>${batchedMigration.filename}</td>
                </tr>
                <tr>
                  <th>Minimum value</th>
                  <td>${batchedMigration.min_value}</td>
                </tr>
                <tr>
                  <th>Maximum value</th>
                  <td>${batchedMigration.max_value}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td>${MigrationStatusBadge(batchedMigration.status)}</td>
                </tr>
                <tr>
                  <th>Created at</th>
                  <td>${batchedMigration.created_at.toUTCString()}</td>
                </tr>
                <tr>
                  <th>Updated at</th>
                  <td>${batchedMigration.updated_at.toUTCString()}</td>
                </tr>
                <tr>
                  <th>Started at</th>
                  <td>${batchedMigration.started_at?.toUTCString()}</td>
                </tr>
                <tr>
                  <th>Actions</th>
                  <td>
                    <form method="POST">
                      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                      <button
                        type="submit"
                        name="__action"
                        value="retry_failed_jobs"
                        class="btn btn-primary btn-sm"
                      >
                        Retry failed jobs
                      </button>
                    </form>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          ${MigrationJobsCard({
            title: 'Recent succeeded jobs',
            jobs: recentSucceededJobs,
            emptyText: 'No recent succeeded jobs',
          })}
          ${MigrationJobsCard({
            title: 'Recent failed jobs',
            jobs: recentFailedJobs,
            emptyText: 'No recent failed jobs',
          })}
        </main>
      </body>
    </html>
  `.toString();
}

/**
 *
 * @param {import('@prairielearn/migrations').BatchedMigrationStatus} status
 * @returns
 */
function MigrationStatusBadge(status) {
  switch (status) {
    case 'pending':
      return html`<span class="badge badge-secondary">Pending</span>`;
    case 'paused':
      return html`<span class="badge badge-secondary">Paused</span>`;
    case 'running':
      return html`<span class="badge badge-primary">Running</span>`;
    case 'finalizing':
      return html`<span class="badge badge-primary">Finalizing</span>`;
    case 'failed':
      return html`<span class="badge badge-danger">Failed</span>`;
    case 'succeeded':
      return html`<span class="badge badge-success">Succeeded</span>`;
    default:
      return html`<span class="badge badge-warning">Unknown (${status})</span>`;
  }
}

/**
 * @param {MigrationJobsCardProps} props
 */
function MigrationJobsCard({ title, jobs, emptyText }) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <span class="mr-auto">${title}</span>
      </div>
      ${jobs.length > 0
        ? html`<div class="list-group list-group-flush">
            ${jobs.map((job) => {
              let duration = null;
              if (job.started_at && job.finished_at) {
                duration = job.finished_at.getTime() - job.started_at.getTime();
              }
              const attemptsLabel = job.attempts === 1 ? 'attempt' : 'attempts';
              const attempts = `${job.attempts} ${attemptsLabel}`;
              const summary = `${job.min_value} - ${job.max_value}`;
              const hasData = job.data != null;
              return html`
                <div class="list-group-item d-flex flex-column">
                  ${hasData
                    ? html`
                        <details>
                          <summary>${summary}</summary>

                          <pre class="mt-3 p-3 rounded bg-dark text-white"><code>${JSON.stringify(
                            job.data,
                            null,
                            2
                          )}</code></pre>
                        </details>
                      `
                    : html`<div>${summary}</div>`}
                  ${job.started_at
                    ? html`
                        <span
                          class="text-muted text-small"
                          style="font-variant-numeric: tabular-nums;"
                        >
                          #${job.id} ran at ${job.started_at.toUTCString()} for ${duration}ms
                          &mdash; ${attempts}
                        </span>
                      `
                    : null}
                </div>
              `;
            })}
          </div>`
        : html`<div class="card-body text-center text-secondary">${emptyText}</div>`}
    </div>
  `;
}

module.exports = {
  AdministratorBatchedMigrations,
  AdministratorBatchedMigration,
};
