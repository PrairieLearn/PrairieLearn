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
 * @property {Record<string, any>} resLocals
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
function AdministratorBatchedMigration({ batchedMigration, resLocals }) {
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
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function MigrationStatusBadge(status) {
  switch (status) {
    case 'pending':
      return html`<span class="badge badge-secondary">Pending</span>`;
    case 'paused':
      return html`<span class="badge badge-secondary">Pending</span>`;
    case 'running':
      return html`<span class="badge badge-info">Running</span>`;
    case 'finalizing':
      return html`<span class="badge badge-info">Finalizing</span>`;
    case 'failed':
      return html`<span class="badge badge-danger">Failed</span>`;
    case 'succeeded':
      return html`<span class="badge badge-success">Succeeded</span>`;
    default:
      return html`<span class="badge badge-warning">Unknown (${status})</span>`;
  }
}

module.exports = {
  AdministratorBatchedMigrations,
  AdministratorBatchedMigration,
};
