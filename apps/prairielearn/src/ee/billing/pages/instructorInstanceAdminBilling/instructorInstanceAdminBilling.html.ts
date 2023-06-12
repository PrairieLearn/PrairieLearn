import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { InstructorInstanceAdminBillingForm } from '../../components/InstructorInstanceAdminBillingForm.html';
import { PlanName } from '../../plans-types';

export function InstructorCourseInstanceBilling({
  requiredPlans,
  institutionPlanGrants,
  courseInstancePlanGrants,
  enrollmentCount,
  enrollmentLimit,
  enrollmentLimitSource,
  externalGradingQuestionCount = 0,
  workspaceQuestionCount = 0,
  resLocals,
}: {
  requiredPlans: PlanName[];
  institutionPlanGrants: PlanName[];
  courseInstancePlanGrants: PlanName[];
  enrollmentCount: number;
  enrollmentLimit: number;
  enrollmentLimitSource: 'course_instance' | 'institution';
  externalGradingQuestionCount: number;
  workspaceQuestionCount: number;
  resLocals: Record<string, any>;
}) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../../pages/partials/head') %>", {
          ...resLocals,
        })}
        ${compiledScriptTag('instructorInstanceAdminBillingClient.ts')}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../../pages/partials/navbar') %>", {
          ...resLocals,
        })}
        <main class="container mb-4">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">Billing</div>
            <div class="card-body">
              ${InstructorInstanceAdminBillingForm({
                initialRequiredPlans: requiredPlans,
                requiredPlans,
                institutionPlanGrants,
                courseInstancePlanGrants,
                enrollmentCount,
                enrollmentLimit,
                enrollmentLimitSource,
                externalGradingQuestionCount,
                workspaceQuestionCount,
                csrfToken: resLocals.__csrf_token,
              })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
