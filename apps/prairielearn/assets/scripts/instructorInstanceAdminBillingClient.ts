$(() => {
  console.log('hello, world');
  const studentBillingEnabled = document.querySelector<HTMLInputElement>('#studentBillingEnabled');
  studentBillingEnabled.addEventListener('change', () => {
    console.log('checked?', studentBillingEnabled.checked);
    console.log(studentBillingEnabled.getAttribute('checked'));
  });
});
