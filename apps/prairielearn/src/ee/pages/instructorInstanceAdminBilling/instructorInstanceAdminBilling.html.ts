import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.html.js';
import { InstructorInstanceAdminBillingForm } from '../../lib/billing/components/InstructorInstanceAdminBillingForm.html.js';
import { type PlanName } from '../../lib/billing/plans-types.js';

export type EnrollmentLimitSource = 'course_instance' | 'institution';

export function InstructorCourseInstanceBilling({
  requiredPlans,
  institutionPlanGrants,
  courseInstancePlanGrants,
  enrollmentCount,
  enrollmentLimit,
  enrollmentLimitSource,
  externalGradingQuestionCount = 0,
  workspaceQuestionCount = 0,
  editable,
  resLocals,
}: {
  requiredPlans: PlanName[];
  institutionPlanGrants: PlanName[];
  courseInstancePlanGrants: PlanName[];
  enrollmentCount: number;
  enrollmentLimit: number;
  enrollmentLimitSource: EnrollmentLimitSource;
  externalGradingQuestionCount: number;
  workspaceQuestionCount: number;
  editable: boolean;
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Billing',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'billing',
    },
    headContent: compiledScriptTag('instructorInstanceAdminBillingClient.ts'),
    content: html`
      ${!editable
        ? html`
            <div class="alert alert-warning">Only course owners can change billing settings.</div>
          `
        : null}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">Billing</div>
        <div class="card-body">
          ${InstructorInstanceAdminBillingForm({
            initialRequiredPlans: requiredPlans,
            desiredRequiredPlans: requiredPlans,
            institutionPlanGrants,
            courseInstancePlanGrants,
            enrollmentCount,
            enrollmentLimit,
            enrollmentLimitSource,
            externalGradingQuestionCount,
            workspaceQuestionCount,
            editable,
            csrfToken: resLocals.__csrf_token,
          })}
        </div>
      </div>
    `,
  });
}
