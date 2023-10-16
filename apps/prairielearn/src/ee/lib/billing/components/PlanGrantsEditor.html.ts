import { html } from '@prairielearn/html';

import { PLANS, PLAN_NAMES, PlanName } from '../plans-types';
import { type PlanGrant } from '../../../../lib/db-types';
import { type DesiredPlan } from '../plans';

export function PlanGrantsEditor({
  planGrants,
  csrfToken,
  excludedPlanNames,
}: {
  planGrants: PlanGrant[];
  csrfToken: string;
  excludedPlanNames: PlanName[];
}) {
  return html`
    <form method="POST">
      <ul class="list-group mb-3">
        ${PLAN_NAMES.map((planName) => {
          if (excludedPlanNames.includes(planName)) {
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
                    (feature) => html`
                      <span class="badge badge-pill badge-secondary text-monospace mr-1">
                        ${feature}
                      </span>
                    `,
                  )}
                </div>
              </div>

              <select
                class="custom-select w-auto js-plan-type"
                name="plan_${planName}_grant_type"
                ${!hasPlanGrant ? 'disabled' : null}
              >
                <option value="trial" ${planGrantType === 'trial' ? 'selected' : null}>
                  trial
                </option>
                <option value="stripe" ${planGrantType === 'stripe' ? 'selected' : null}>
                  stripe
                </option>
                <option value="invoice" ${planGrantType === 'invoice' ? 'selected' : null}>
                  invoice
                </option>
                <option value="gift" ${planGrantType === 'gift' ? 'selected' : null}>gift</option>
              </select>
            </li>
          `;
        })}
      </ul>
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="submit" name="__action" value="update_plans" class="btn btn-primary">
        Save
      </button>
    </form>
  `;
}

export function parseDesiredPlanGrants({
  body,
  allowedPlans,
}: {
  body: any;
  allowedPlans: PlanName[];
}) {
  const desiredPlans: DesiredPlan[] = [];
  for (const plan of allowedPlans) {
    const planGranted = !!body[`plan_${plan}`];
    const planGrantType = body[`plan_${plan}_grant_type`];
    if (planGranted) {
      desiredPlans.push({
        plan,
        grantType: planGrantType,
      });
    }
  }
  return desiredPlans;
}
