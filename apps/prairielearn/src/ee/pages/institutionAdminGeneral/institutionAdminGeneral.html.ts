import { z } from 'zod';
import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html, type HtmlValue } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { type PlanGrant, type Institution } from '../../../lib/db-types';
import { PLAN_NAMES, PLANS } from '../../lib/billing/plans-types';

export const InstitutionStatisticsSchema = z.object({
  course_count: z.number(),
  course_instance_count: z.number(),
  enrollment_count: z.number(),
});
type InstitutionStatistics = z.infer<typeof InstitutionStatisticsSchema>;

export function InstitutionAdminGeneral({
  institution,
  statistics,
  planGrants,
  resLocals,
}: {
  institution: Institution;
  statistics: InstitutionStatistics;
  planGrants: PlanGrant[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'General',
        })}
        ${compiledScriptTag('institutionAdminGeneralClient.ts')}
        <style>
          .card-grid {
            display: grid;
            grid-template-columns: repeat(1, 1fr);
            gap: 1rem;
          }

          @media (min-width: 768px) {
            .card-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
        </style>
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'general',
        })}
        <main class="container mb-4">
          <h2 class="h4">Statistics</h2>
          <div class="card-grid mb-3">
            ${StatisticsCard({ title: 'Courses', value: statistics.course_count })}
            ${StatisticsCard({
              title: 'Course instances',
              value: statistics.course_instance_count,
            })}
            ${StatisticsCard({ title: 'Enrollments', value: statistics.enrollment_count })}
          </div>

          <h2 class="h4">Limits</h2>
          <form method="POST" class="mb-3">
            <div class="form-group">
              <label for="course_instance_enrollment_limit">Course instance enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="course_instance_enrollment_limit"
                name="course_instance_enrollment_limit"
                value="${institution.course_instance_enrollment_limit}"
                aria-describedby="course_instance_enrollment_limit_help"
              />
              <small id="course_instance_enrollment_limit_help" class="form-text text-muted">
                The maximum number of enrollments allowed for a single course instance. A blank
                value allows for unlimited enrollments. This value can be overridden on individual
                course instances.
              </small>
            </div>
            <div class="form-group">
              <label for="yearly_enrollment_limit">Yearly enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="yearly_enrollment_limit"
                name="yearly_enrollment_limit"
                value="${institution.yearly_enrollment_limit}"
                aria-describedby="yearly_enrollment_limit_help"
              />
              <small id="yearly_enrollment_limit_help" class="form-text text-muted">
                The maximum number of enrollments allowed per year. A blank value allows for
                unlimited enrollments. The limit is applied on a rolling basis; that is, it applies
                to the previous 365 days from the instant a student attempts to enroll.
              </small>
            </div>
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button
              type="submit"
              name="__action"
              value="update_enrollment_limits"
              class="btn btn-primary"
            >
              Save
            </button>
          </form>

          <h2 class="h4">Plans</h2>
          <form method="POST">
            ${Plans({ planGrants })}
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" name="__action" value="update_plans" class="btn btn-primary">
              Save
            </button>
          </form>
        </main>
      </body>
    </html>
  `.toString();
}

function StatisticsCard({ title, value }: { title: string; value: HtmlValue }) {
  return html`
    <div class="card d-flex flex-column p-3 align-items-center">
      <span class="h4">${value}</span>
      <span class="text-muted">${title}</span>
    </div>
  `;
}

function Plans({ planGrants }: { planGrants: PlanGrant[] }) {
  return html`<ul class="list-group mb-3">
    ${PLAN_NAMES.map((planName) => {
      if (planName === 'basic') {
        // The basic plan is never available at the institution level; it's only
        // used for student billing for enrollments.
        return null;
      }

      const planFeatures = PLANS[planName].features;
      const planGrant = planGrants.find((grant) => grant.plan_name === planName);
      const hasPlanGrant = !!planGrant;
      const planGrantType = planGrant?.type ?? 'trial';

      return html`
        <li class="list-group-item d-flex flex-row align-items-center js-plan">
          <div class="form-check flex-grow-1">
            <input
              class="form-check-input js-plan-enabled"
              type="checkbox"
              name="plan_${planName}"
              ${hasPlanGrant ? 'checked' : ''}
              value="1"
              id="plan_${planName}"
            />
            <label class="form-check-label text-monospace" for="plan_${planName}">
              ${planName}
            </label>
            <div>
              ${planFeatures.map(
                (feature) =>
                  html`
                    <span class="badge badge-pill badge-secondary text-monospace mr-1">
                      ${feature}
                    </span>
                  `
              )}
            </div>
          </div>

          <select
            class="custom-select w-auto js-plan-type"
            name="plan_${planName}_grant_type"
            ${!hasPlanGrant ? 'disabled' : null}
          >
            <option value="trial" ${planGrantType === 'trial' ? 'selected' : null}>trial</option>
            <option value="stripe" ${planGrantType === 'stripe' ? 'selected' : null}>stripe</option>
            <option value="invoice" ${planGrantType === 'invoice' ? 'selected' : null}>
              invoice
            </option>
            <option value="gift" ${planGrantType === 'gift' ? 'selected' : null}>gift</option>
          </select>
        </li>
      `;
    })}
  </ul>`;
}
