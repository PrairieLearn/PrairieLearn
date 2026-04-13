import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

import type { Lti13CourseRequestInput } from '../../src/pages/instructorRequestCourse/instructorRequestCourse.types.js';

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'icloud.com',
  'outlook.com',
  'yahoo.com',
]);

interface CheckResult {
  owned: boolean;
  exists: boolean;
}

onDocumentReady(() => {
  const submitButton = document.querySelector<HTMLButtonElement>(
    '.question-form button[type=submit]',
  );
  const titleInput = document.querySelector<HTMLInputElement>('#cr-title');
  const shortNameInput = document.querySelector<HTMLInputElement>('#cr-shortname');

  const warnings = {
    title: {
      owned: document.querySelector<HTMLElement>('#cr-title-owned'),
      exists: document.querySelector<HTMLElement>('#cr-title-exists'),
    },
    short_name: {
      owned: document.querySelector<HTMLElement>('#cr-shortname-owned'),
      exists: document.querySelector<HTMLElement>('#cr-shortname-exists'),
    },
  };

  let selectedRole: string | null = null;
  let titleResult: CheckResult = { owned: false, exists: false };
  let shortNameResult: CheckResult = { owned: false, exists: false };
  let checkTimeout: ReturnType<typeof setTimeout> | null = null;
  let checkIsLoading = false;
  let latestCheckSeq = 0;

  const BUTTON_VARIANTS = ['btn-primary', 'btn-warning', 'btn-danger'];

  const inputs = {
    title: titleInput,
    short_name: shortNameInput,
  };

  function updateInputValidationState(
    input: HTMLInputElement | null | undefined,
    warningId: string | null,
  ) {
    if (!input || input.disabled) return;

    if (warningId) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-errormessage', warningId);
    } else {
      input.setAttribute('aria-invalid', 'false');
      input.removeAttribute('aria-errormessage');
    }
  }

  function updateWarnings(field: 'title' | 'short_name', result: CheckResult) {
    warnings[field].owned?.classList.toggle('d-none', !result.owned);
    warnings[field].exists?.classList.toggle('d-none', result.owned || !result.exists);

    const input = inputs[field];
    const activeWarningId = result.owned
      ? warnings[field].owned?.id
      : result.exists
        ? warnings[field].exists?.id
        : null;
    updateInputValidationState(input, activeWarningId ?? null);
  }

  const emailInput = document.querySelector<HTMLInputElement>('#cr-email');
  const emailWarning = document.querySelector<HTMLElement>('#cr-email-warning');

  function updateEmailWarning() {
    const domain = emailInput?.value.split('@')[1]?.toLowerCase();
    const showWarning = !!domain && PERSONAL_EMAIL_DOMAINS.has(domain);

    emailWarning?.classList.toggle('d-none', !showWarning);
    updateInputValidationState(emailInput, showWarning ? (emailWarning?.id ?? null) : null);
  }

  function updateSubmitButton() {
    if (!submitButton) return;
    const blocked = titleResult.owned || shortNameResult.owned;
    const warned =
      (titleResult.exists && !titleResult.owned) ||
      (shortNameResult.exists && !shortNameResult.owned);
    submitButton.disabled = blocked || checkIsLoading || selectedRole !== 'instructor';
    const variant = blocked ? 'btn-danger' : warned ? 'btn-warning' : 'btn-primary';
    submitButton.classList.remove(...BUTTON_VARIANTS);
    submitButton.classList.add(variant);
  }

  function scheduleCheck() {
    if (checkTimeout) clearTimeout(checkTimeout);
    const checkSeq = ++latestCheckSeq;

    const title = titleInput?.value.trim() ?? '';
    const short_name = shortNameInput?.value.trim().toUpperCase() ?? '';

    if (!title && !short_name) {
      titleResult = { owned: false, exists: false };
      shortNameResult = { owned: false, exists: false };
      updateWarnings('title', titleResult);
      updateWarnings('short_name', shortNameResult);
      checkIsLoading = false;
      updateSubmitButton();
      return;
    }

    checkIsLoading = true;
    updateSubmitButton();

    checkTimeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (title) params.set('title', title);
        if (short_name) params.set('short_name', short_name);
        const resp = await fetch(`/pl/request_course/check?${params.toString()}`);
        if (!resp.ok) return;
        const data = (await resp.json()) as { title: CheckResult; short_name: CheckResult };
        if (checkSeq !== latestCheckSeq) return;
        titleResult = data.title;
        shortNameResult = data.short_name;
        updateWarnings('title', titleResult);
        updateWarnings('short_name', shortNameResult);
      } finally {
        if (checkSeq === latestCheckSeq) {
          checkIsLoading = false;
          updateSubmitButton();
        }
      }
    }, 300);
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

  // Check for existing courses on title or rubric change.
  titleInput?.addEventListener('input', scheduleCheck);
  shortNameInput?.addEventListener('input', scheduleCheck);

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
  emailInput?.addEventListener('input', updateEmailWarning);

  updateWarnings('title', titleResult);
  updateWarnings('short_name', shortNameResult);
  updateEmailWarning();

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
        if (input instanceof HTMLInputElement && !input.readOnly && !input.disabled) {
          input.value = value;
        }
      }
      updateEmailWarning();
      scheduleCheck();
      modal.hide();
    });
  }
});
