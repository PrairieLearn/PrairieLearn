import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export const FeatureGrantRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  institution_id: z.string().nullable(),
  institution_short_name: z.string().nullable(),
  institution_long_name: z.string().nullable(),
  course_id: z.string().nullable(),
  course_title: z.string().nullable(),
  course_short_name: z.string().nullable(),
  course_instance_id: z.string().nullable(),
  course_instance_short_name: z.string().nullable(),
  course_instance_long_name: z.string().nullable(),
  user_id: z.string().nullable(),
  user_uid: z.string().nullable(),
  user_name: z.string().nullable(),
});
type FeatureGrantRow = z.infer<typeof FeatureGrantRowSchema>;

export function AdministratorFeatures({
  features,
  resLocals,
}: {
  features: string[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
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

export function AdministratorFeature({
  feature,
  featureGrants,
  resLocals,
}: {
  feature: string;
  featureGrants: FeatureGrantRow[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
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

function FeatureGrantBreadcrumbs({ featureGrant }: { featureGrant: FeatureGrantRow }) {
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

function FeatureGrant({ featureGrant }: { featureGrant: FeatureGrantRow }) {
  return html`
    <div class="list-group-item d-flex flex-row align-items-center">
      <div>${FeatureGrantBreadcrumbs({ featureGrant })}</div>
    </div>
  `;
}
