import { instructorInstanceAdminBillingState } from '../../src/ee/billing/pages/instructorInstanceAdminBilling/instructorInstanceAdminBillingShared';

$(() => {
  console.log('hello, world');
  const studentBillingEnabledCheckbox =
    document.querySelector<HTMLInputElement>('#studentBillingEnabled');
  const computeEnabledCheckbox = document.querySelector<HTMLInputElement>('#computeEnabled');
  const studentBillingWarning = document.querySelector<HTMLElement>('.js-student-billing-warning');
  // TODO: should we do something with these values?
  const enrollmentCount = Number.parseInt(studentBillingWarning.dataset.enrollmentCount, 10);
  const enrollmentLimit = Number.parseInt(studentBillingWarning.dataset.enrollmentLimit, 10);
  const initialStudentBillingEnabled =
    studentBillingWarning.dataset.studentBillingEnabled === 'true';
  const initialComputeEnabled = studentBillingWarning.dataset.computeEnabled === 'true';

  function updateAlert() {
    const showAlert =
      (!initialStudentBillingEnabled && studentBillingEnabledCheckbox.checked) ||
      (!initialComputeEnabled && computeEnabledCheckbox.checked);
    studentBillingWarning.hidden = !showAlert;
  }

  studentBillingEnabledCheckbox.addEventListener('change', () => {
    updateAlert();
  });
  computeEnabledCheckbox.addEventListener('change', () => {
    updateAlert();
  });

  updateAlert();

  const state = instructorInstanceAdminBillingState();
});
