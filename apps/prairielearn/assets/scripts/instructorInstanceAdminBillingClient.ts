import morphdom = require('morphdom');

import { InstructorInstanceAdminBillingForm } from '../../src/ee/billing/components/InstructorInstanceAdminBillingForm.html';
import { PlanName } from '../../src/ee/billing/plans-types';

$(() => {
  const billingForm = document.querySelector<HTMLFormElement>('.js-billing-form');
  const initialProps = JSON.parse(billingForm.dataset.props);

  const studentBillingCheckbox = document.querySelector<HTMLInputElement>('#studentBillingEnabled');
  const computeCheckbox = document.querySelector<HTMLInputElement>('#computeEnabled');

  billingForm.addEventListener('change', () => {
    const basicPlanEnabled = studentBillingCheckbox.checked;
    const computePlanEnabled = computeCheckbox.checked;

    const requiredPlans: PlanName[] = [];
    if (basicPlanEnabled) requiredPlans.push('basic');
    if (computePlanEnabled) requiredPlans.push('compute');

    const newHtml = InstructorInstanceAdminBillingForm({
      ...initialProps,
      requiredPlans,
    }).toString();
    morphdom(billingForm, newHtml);
  });
});
