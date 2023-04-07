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
                    const migrationName = `${migration.timestamp}_${migration.name}`;
                    return html` <div class="list-group-item">${migrationName}</div> `;
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
function AdministratorBatchedMigration({ resLocals }) {
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
      </body>
    </html>
  `.toString();
}

module.exports = {
  AdministratorBatchedMigrations,
  AdministratorBatchedMigration,
};
