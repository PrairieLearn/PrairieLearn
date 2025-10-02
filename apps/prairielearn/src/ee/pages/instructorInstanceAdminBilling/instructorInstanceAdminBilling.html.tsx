import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../../components/PageLayout.js';
import { type PlanName } from '../../lib/billing/plans-types.js';

import { InstructorInstanceAdminBillingForm } from './components/InstructorInstanceAdminBillingForm.js';

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
    content: (
      <>
        {!editable && (
          <div class="alert alert-warning">Only course owners can change billing settings.</div>
        )}
        <div class="card mb-4">
          <div class="card-header bg-primary text-white d-flex">Billing</div>
          <div class="card-body">
            <Hydrate>
              <InstructorInstanceAdminBillingForm
                initialRequiredPlans={requiredPlans}
                desiredRequiredPlans={requiredPlans}
                institutionPlanGrants={institutionPlanGrants}
                courseInstancePlanGrants={courseInstancePlanGrants}
                enrollmentCount={enrollmentCount}
                enrollmentLimit={enrollmentLimit}
                enrollmentLimitSource={enrollmentLimitSource}
                externalGradingQuestionCount={externalGradingQuestionCount}
                workspaceQuestionCount={workspaceQuestionCount}
                editable={editable}
                csrfToken={resLocals.__csrf_token}
              />
            </Hydrate>
          </div>
        </div>
      </>
    ),
  });
}
