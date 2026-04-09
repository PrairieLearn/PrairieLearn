import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

import type { Lti13CourseRequestInput } from '../../src/pages/instructorRequestCourse/instructorRequestCourse.types.js';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'icloud.com',
  'outlook.com',
  'yahoo.com',
]);

onDocumentReady(() => {
  const submitButton = document.querySelector<HTMLButtonElement>(
    '.question-form button[type=submit]',
  );
  const titleInput = document.querySelector<HTMLInputElement>('#cr-title');
  const titleOwnedWarning = document.querySelector<HTMLElement>('#cr-title-owned');
  const titleExistsWarning = document.querySelector<HTMLElement>('#cr-title-exists');

  let selectedRole: string | null = null;
  let courseIsOwned = false;
  let courseExists = false;
  let checkTimeout: ReturnType<typeof setTimeout> | null = null;

  function updateSubmitButton() {
    if (!submitButton) return;
    const blocked = courseIsOwned;
    const warned = courseExists && !courseIsOwned;
    submitButton.disabled = blocked || selectedRole !== 'instructor';
    submitButton.className = `btn ${blocked ? 'btn-danger' : warned ? 'btn-warning' : 'btn-primary'}`;
  }

  // Role selection.
  document.querySelectorAll<HTMLInputElement>('input[name=cr-role]').forEach((radio) =>
    radio.addEventListener('change', () => {
      selectedRole = radio.value;
      updateSubmitButton();
      document
        .querySelectorAll<HTMLElement>('.role-comment')
        .forEach((c) => c.classList.add('d-none'));
      document
        .querySelector<HTMLElement>(`.role-comment-${selectedRole}`)
        ?.classList.remove('d-none');
    }),
  );

  // Check for existing courses with the same title.
  titleInput?.addEventListener('input', () => {
    if (checkTimeout) clearTimeout(checkTimeout);
    const title = titleInput.value.trim();

    if (!title) {
      courseIsOwned = false;
      courseExists = false;
      titleOwnedWarning?.classList.add('d-none');
      titleExistsWarning?.classList.add('d-none');
      updateSubmitButton();
      return;
    }

    checkTimeout = setTimeout(async () => {
      try {
        const resp = await fetch(`/pl/request_course/check?title=${encodeURIComponent(title)}`);
        if (!resp.ok) return;
        const data = (await resp.json()) as { owned: boolean; exists: boolean };
        courseIsOwned = data.owned;
        courseExists = data.exists;
        titleOwnedWarning?.classList.toggle('d-none', !data.owned);
        titleExistsWarning?.classList.toggle('d-none', data.owned || !data.exists);
        updateSubmitButton();
      } catch {
        // Non-critical check; ignore network errors.
      }
    }, 300);
  });

  // Referral source "other" toggle.
  document
    .querySelector<HTMLSelectElement>('#cr-referral-source')
    ?.addEventListener('change', function () {
      const other = document.querySelector<HTMLInputElement>('#cr-referral-source-other');
      if (!other) return;
      const isOther = this.value === 'other';
      other.classList.toggle('d-none', !isOther);
      other.required = isOther;
      if (isOther) other.focus();
    });

  // Non-institutional email warning (only rendered for default-institution users).
  const emailInput = document.querySelector<HTMLInputElement>('#cr-email');
  const emailWarning = document.querySelector<HTMLElement>('#cr-email-warning');
  emailInput?.addEventListener('input', () => {
    const domain = emailInput.value.split('@')[1]?.toLowerCase();
    emailWarning?.classList.toggle('d-none', !domain || !FREE_EMAIL_DOMAINS.has(domain));
  });

  // LTI 1.3 auto-fill.
  const lti13Info = decodeData<Lti13CourseRequestInput>('course-request-lti13-info');
  if (lti13Info) {
    const modal = window.bootstrap.Modal.getOrCreateInstance('#fill-course-request-lti13-modal');
    modal.show();

    document.getElementById('fill-course-request-lti13-info')?.addEventListener('click', () => {
      const form = document.querySelector<HTMLFormElement>('form[name="course-request"]');
      if (!form) return;
      for (const [name, value] of Object.entries(lti13Info)) {
        const input = form.elements.namedItem(name);
        if (input) (input as HTMLInputElement).value = value;
      }
      modal.hide();
    });
  }
});
