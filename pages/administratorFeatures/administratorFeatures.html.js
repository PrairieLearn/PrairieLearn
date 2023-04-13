// @ts-check
const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

/** @typedef {import('./administratorFeatures').FeatureGrantRow} FeatureGrantRow */

/**
 * @typedef {Object} AdministratorFeaturesProps
 * @property {string[]} features
 * @property {Record<string, any>} resLocals
 */

/**
 * @typedef {Object} AdministratorFeatureProps
 * @property {string} feature
 * @property {FeatureGrantRow[]} featureGrants
 * @property {Record<string, any>} resLocals
 */

/**
 * @typedef {Object} FeatureGrantProps
 * @property {FeatureGrantRow} featureGrant
 */

/**
 * @param {AdministratorFeaturesProps} props
 */
function AdministratorFeatures({ features, resLocals }) {
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
          navSubPage: 'features',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Features</div>
            ${features.length > 0
              ? html`<div class="list-group list-group-flush">
                  ${features.map((feature) => {
                    return html`
                      <div class="list-group-item d-flex align-items-center">
                        <a
                          href="${resLocals.urlPrefix}/administrator/features/${feature}"
                          class="mr-auto text-monospace"
                        >
                          ${feature}
                        </a>
                      </div>
                    `;
                  })}
                </div>`
              : html`<div class="card-body text-center text-secondary">No features</div>`}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

/**
 * @param {AdministratorFeatureProps} props
 */
function AdministratorFeature({ feature, featureGrants, resLocals }) {
  return html`
    <!DOCTYPE html>
    <html>
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
        <style>
          .list-inline-item:not(:first-child):before {
            margin-right: 0.5rem;
            content: '/';
          }
        </style>
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'features',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <span class="text-monospace">${feature}</span>
            </div>
            ${featureGrants.length > 0
              ? html`
                  <div class="list-group list-group-flush">
                    ${featureGrants.map((featureGrant) => {
                      return FeatureGrant({ featureGrant });
                    })}
                  </div>
                `
              : html`
                  <div class="card-body text-center text-secondary">
                    There are no grants for this feature
                  </div>
                `}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

/**
 * @param {FeatureGrantProps} props
 */
function FeatureGrantBreadcrumbs({ featureGrant }) {
  const hasInstitution = featureGrant.institution_id !== null;
  const hasCourse = featureGrant.course_id !== null;
  const hasCourseInstance = featureGrant.course_instance_id !== null;
  const hasUser = featureGrant.user_id !== null;
  return html`
    <ol class="list-inline mb-0">
      ${
        hasInstitution
          ? html`
              <li class="list-inline-item inline-flex">
                ${featureGrant.institution_long_name} (${featureGrant.institution_short_name})
              </li>
            `
          : null
      }
      ${
        hasCourse
          ? html`<li class="list-inline-item inline-flex">
              ${featureGrant.course_title} (${featureGrant.course_short_name})
            </li>`
          : null
      }
      ${
        hasCourseInstance
          ? html`<li class="list-inline-item inline-flex">
              ${featureGrant.course_instance_long_name} (${featureGrant.course_instance_short_name})
            </li>`
          : null
      }
      ${
        hasUser
          ? html`<li class="list-inline-item inline-flex">
              ${featureGrant.user_name} (${featureGrant.user_uid})
            </li>`
          : null
      }
      </li>
    </ol>
  `;
}

/** @param {FeatureGrantProps} props */
function FeatureGrantBadge({ featureGrant }) {
  switch (featureGrant.type) {
    case 'default':
      return html`<span class="badge badge-pill badge-secondary">default</span>`;
    case 'manual':
      return html`<span class="badge badge-pill badge-primary">manual</span>`;
    case 'subscription':
      return html`<span class="badge badge-pill badge-success">subscription</span>`;
  }
}

/**
 * @param {FeatureGrantProps} props
 */
function FeatureGrant({ featureGrant }) {
  return html`
    <div class="list-group-item d-flex flex-row align-items-center">
      <div>${FeatureGrantBreadcrumbs({ featureGrant })}</div>
      <div class="ml-auto">${FeatureGrantBadge({ featureGrant })}</div>
    </div>
  `;
}

module.exports = { AdministratorFeatures, AdministratorFeature };
