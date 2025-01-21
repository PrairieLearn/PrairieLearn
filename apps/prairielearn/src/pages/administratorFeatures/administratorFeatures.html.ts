import { z } from 'zod';

import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { type Course, type CourseInstance, type Institution } from '../../lib/db-types.js';

export const FeatureGrantRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
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
        ${HeadContents({ resLocals, pageTitle: 'Features' })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'features' })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Features</h1>
            </div>
            ${features.length > 0
              ? html`
                  <div class="list-group list-group-flush">
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
                  </div>
                `
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
  featureInConfig,
  institutions,
  resLocals,
}: {
  feature: string;
  institutions: Institution[];
  featureGrants: FeatureGrantRow[];
  featureInConfig: boolean | null;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Features' })}
        ${compiledScriptTag('administratorFeaturesClient.ts')}
        <style>
          .list-inline-item:not(:first-child):before {
            margin-right: 0.5rem;
            content: '/';
          }
          [data-loading] {
            display: none;
          }
        </style>
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'admin', navSubPage: 'features' })}
        ${AddFeatureGrantModal({
          feature,
          // Default to enabled for new grants.
          enabled: true,
          institutions,
          csrfToken: resLocals.__csrf_token,
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <span class="text-monospace">${feature}</span>
              <button
                class="btn btn-light ml-auto"
                data-toggle="modal"
                data-target="#add-feature-grant-modal"
              >
                Grant feature
              </button>
            </div>
            ${featureGrants.length > 0 || featureInConfig != null
              ? html`
                  <div class="list-group list-group-flush">
                    ${featureInConfig != null
                      ? html`
                          <div class="list-group-item">
                            <i
                              class="fa-solid mr-1 ${featureInConfig
                                ? 'fa-check text-success'
                                : 'fa-times text-danger'}"
                            ></i>
                            Feature ${featureInConfig ? 'enabled' : 'disabled'} in configuration
                            file
                          </div>
                        `
                      : ''}
                    ${featureGrants.map((featureGrant) =>
                      FeatureGrant({
                        featureGrant,
                        overridden: featureInConfig != null,
                        csrfToken: resLocals.__csrf_token,
                      }),
                    )}
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
  const isGlobal = !hasInstitution && !hasCourse && !hasCourseInstance && !hasUser;
  return html`
    <ol class="list-inline mb-0">
      ${
        isGlobal
          ? html`<li class="list-inline-item inline-flex">
              <i class="fa-solid fa-globe mr-1"></i>
              Global
            </li>`
          : null
      }
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
              ${featureGrant.course_short_name}: ${featureGrant.course_title}
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
              ${featureGrant.user_uid} (${featureGrant.user_name})
            </li>`
          : null
      }
      </li>
    </ol>
  `;
}

function FeatureGrant({
  featureGrant,
  overridden,
  csrfToken,
}: {
  featureGrant: FeatureGrantRow;
  overridden: boolean;
  csrfToken: string;
}) {
  return html`
    <div
      class="list-group-item d-flex flex-column flex-md-row flex-nowrap align-items-md-center ${overridden
        ? 'text-muted'
        : ''}"
    >
      <div>${FeatureGrantBreadcrumbs({ featureGrant })}</div>
      <div class="ml-auto d-flex flex-row flex-nowrap flex-shrink-0">
        <form
          method="POST"
          class="mr-2"
          hx-boost="true"
          hx-trigger="change"
          hx-ext="morphdom-swap"
          hx-swap="morphdom"
        >
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <input type="hidden" name="feature_grant_id" value="${featureGrant.id}" />
          <input type="hidden" name="__action" value="update_feature_grant_enabled" />
          <select
            class="form-select form-select-sm"
            aria-label="Enable or disable feature"
            name="feature_grant_enabled"
          >
            <option value="enabled" ${featureGrant.enabled ? 'selected' : ''}>✅ Enabled</option>
            <option value="disabled" ${featureGrant.enabled ? '' : 'selected'}>❌ Disabled</option>
          </select>
        </form>

        <form
          method="POST"
          hx-boost="true"
          hx-confirm="Are you sure you want to revoke this feature grant?"
          hx-ext="morphdom-swap"
          hx-swap="morphdom"
        >
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <input type="hidden" name="feature_grant_id" value="${featureGrant.id}" />
          <button
            type="submit"
            name="__action"
            value="revoke_feature_grant"
            class="btn btn-sm btn-outline-danger"
          >
            Revoke
          </button>
        </form>
      </div>
    </div>
  `;
}

interface FeatureGrantModalProps {
  feature: string;
  enabled: boolean;
  institutions: Institution[];
  institution_id?: string | null;
  courses?: Course[];
  course_id?: string | null;
  course_instances?: CourseInstance[];
  course_instance_id?: string | null;
  csrfToken: string;
}

function AddFeatureGrantModal(props: FeatureGrantModalProps) {
  return Modal({
    title: 'Grant feature',
    id: 'add-feature-grant-modal',
    body: AddFeatureGrantModalBody(props),
    footer: html`
      <input type="hidden" name="__csrf_token" value="${props.csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" name="__action" value="add_feature_grant" class="btn btn-primary">
        Grant feature
      </button>
    `,
  });
}

export function AddFeatureGrantModalBody({
  feature,
  enabled,
  institutions,
  institution_id,
  courses,
  course_id,
  course_instances,
  course_instance_id,
}: Omit<FeatureGrantModalProps, 'csrfToken'>) {
  const modalUrl = `/pl/administrator/features/${feature}/modal`;
  return html`
    <fieldset
      hx-get="${modalUrl}"
      hx-trigger="change"
      hx-target="this"
      hx-include="closest .modal-body"
      hx-ext="loading-states,morphdom-swap"
      hx-swap="morphdom"
      data-loading-disable
      data-loading-delay="200"
    >
      <div class="form-check">
        <input
          type="radio"
          class="form-check-input"
          id="feature-grant-enabled"
          name="enabled"
          value="true"
          ${enabled ? 'checked' : ''}
        />
        <label class="form-check-label" for="feature-grant-enabled">Enable feature</label>
      </div>
      <div class="form-check">
        <input
          type="radio"
          class="form-check-input"
          id="feature-grant-disabled"
          name="enabled"
          value="false"
          ${enabled ? '' : 'checked'}
        />
        <label class="form-check-label" for="feature-grant-disabled">Disable feature</label>
        <div class="small text-muted">
          Enabling or disabling a feature overrides any settings from a parent institution, course,
          and so on.
        </div>
      </div>

      <hr />

      <div class="form-group">
        <label for="feature-grant-institution">
          Institution
          <div class="spinner-border spinner-border-sm" role="status" data-loading></div>
        </label>
        <select class="custom-select" id="feature-grant-institution" name="institution_id">
          <option value="">All institutions</option>
          ${institutions.map((institution) => {
            return html`
              <option
                value="${institution.id}"
                ${institution.id === institution_id ? 'selected' : ''}
              >
                ${institution.short_name}: ${institution.long_name} (${institution.id})
              </option>
            `;
          })}
        </select>
      </div>

      <div class="form-group">
        <label for="feature-grant-course">
          Course
          <div class="spinner-border spinner-border-sm" role="status" data-loading></div>
        </label>
        <select
          class="custom-select"
          id="feature-grant-course"
          name="course_id"
          ${!institution_id ? 'disabled' : ''}
        >
          <option value="">All courses in this institution</option>
          ${(courses ?? []).map((course) => {
            return html`
              <option value="${course.id}" ${course.id === course_id ? 'selected' : ''}>
                ${course.short_name}: ${course.title} (${course.id})
              </option>
            `;
          })}
        </select>
      </div>

      <div class="form-group">
        <label for="feature-grant-course-instance">
          Course instance
          <div class="spinner-border spinner-border-sm" role="status" data-loading></div>
        </label>
        <select
          class="custom-select"
          id="feature-grant-course-instance"
          name="course_instance_id"
          ${!course_id ? 'disabled' : ''}
        >
          <option value="">All courses instances in this course</option>
          ${(course_instances ?? []).map((course_instance) => {
            return html`
              <option
                value="${course_instance.id}"
                ${course_instance.id === course_instance_id ? 'selected' : ''}
              >
                ${course_instance.short_name}: ${course_instance.long_name} (${course_instance.id})
              </option>
            `;
          })}
        </select>
      </div>
    </fieldset>
  `;
}
