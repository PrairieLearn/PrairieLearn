import './lib/htmx';
import 'htmx-ext-loading-states/dist/loading-states.js';

import CookiesModule from 'js-cookie';

import { onDocumentReady } from '@prairielearn/browser-utils';

const COOKIE_EXPIRATION_DAYS = 30;

onDocumentReady(() => {
  const usernameNav = document.getElementById('username-nav');
  // The navbar is not present in some pages (e.g., workspace pages), in that case we do nothing.
  if (!usernameNav) return;

  // Old cookies did not have a domain.
  const OldCookies = CookiesModule.withAttributes({
    path: '/',
    expires: COOKIE_EXPIRATION_DAYS,
    secure: location.protocol === 'https:',
  });

  // New cookies do have a domain.
  const Cookies = CookiesModule.withAttributes({
    path: '/',
    expires: COOKIE_EXPIRATION_DAYS,
    domain:
      document.querySelector('meta[name="cookie-domain"]')?.getAttribute('content') ?? undefined,
    secure: location.protocol === 'https:',
  });

  type OldAndNewCookieNames = [string, string];

  function setCookie(names: OldAndNewCookieNames, value: string) {
    OldCookies.set(names[0], value);
    Cookies.set(names[1], value);
  }

  // When removing cookies, we need to remove the cookies both with and without
  // an explicit domain.
  function removeCookie(names: OldAndNewCookieNames) {
    OldCookies.remove(names[0]);
    Cookies.remove(names[1]);
  }

  const accessAsAdministrator = usernameNav.dataset.accessAsAdministrator === 'true';
  const viewType = usernameNav.dataset.viewType;
  const authnCourseRole = usernameNav.dataset.authnCourseRole;
  const authnCourseInstanceRole = usernameNav.dataset.authnCourseInstanceRole;
  // Note: this corresponds to `user_with_requested_uid_has_instructor_access_to_course_instance`.
  // Be careful what you use it for.
  const hasInstructorAccess = usernameNav.dataset.hasInstructorAccess === 'true';

  document.querySelector('#navbar-load-from-disk')?.addEventListener('click', () => {
    removeCookie(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookie(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    removeCookie(['pl_requested_date', 'pl2_requested_date']);
    setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
  });

  document.querySelector('#navbar-administrator-toggle')?.addEventListener('click', () => {
    if (accessAsAdministrator) {
      setCookie(['pl_access_as_administrator', 'pl2_access_as_administrator'], 'inactive');
      setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    } else {
      setCookie(['pl_access_as_administrator', 'pl2_access_as_administrator'], 'active');
      setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    }
    location.reload();
  });

  document.querySelector('#navbar-reset-view')?.addEventListener('click', () => {
    removeCookie(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookie(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    removeCookie(['pl_requested_date', 'pl2_requested_date']);
    setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-authn-instructor')?.addEventListener('click', () => {
    removeCookie(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookie(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document
    .querySelector('#navbar-user-view-authn-student-no-rules')
    ?.addEventListener('click', () => {
      removeCookie(['pl_requested_uid', 'pl2_requested_uid']);
      removeCookie(['pl_requested_course_role', 'pl2_requested_course_role']);
      removeCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
      setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

      if (viewType === 'student') {
        location.reload();
      }
    });

  document.querySelector('#navbar-user-view-authn-student')?.addEventListener('click', () => {
    removeCookie(['pl_requested_uid', 'pl2_requested_uid']);
    setCookie(['pl_requested_course_role', 'pl2_requested_course_role'], 'None');
    setCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'], 'None');
    setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-instructor')?.addEventListener('click', () => {
    removeCookie(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student-no-rules')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      removeCookie(['pl_requested_course_role', 'pl2_requested_course_role']);
      removeCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    } else {
      if (authnCourseRole && authnCourseInstanceRole) {
        setCookie(['pl_requested_course_role', 'pl2_requested_course_role'], authnCourseRole);
        setCookie(
          ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'],
          authnCourseInstanceRole,
        );
      }
    }

    setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      setCookie(['pl_requested_course_role', 'pl2_requested_course_role'], 'None');
      setCookie(
        ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'],
        'None',
      );
    } else {
      removeCookie(['pl_requested_course_role', 'pl2_requested_course_role']);
      removeCookie(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    }

    setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.js-remove-override').forEach((element) => {
    element.addEventListener('click', () => {
      const cookieName = element.dataset.overrideCookie;

      if (!cookieName) {
        throw new Error('Missing override cookie name');
      }

      removeCookie([cookieName, cookieName.replace(/^pl_/, 'pl2_')]);

      location.reload();
    });
  });

  const effectiveUidInput = document.querySelector<HTMLInputElement>('.js-effective-uid-input');
  const effectiveUidButton = document.querySelector<HTMLButtonElement>('.js-effective-uid-button');

  effectiveUidInput?.addEventListener('input', () => {
    if (effectiveUidInput.value.trim() !== '') {
      effectiveUidButton?.removeAttribute('disabled');
    } else {
      effectiveUidButton?.setAttribute('disabled', 'true');
    }
  });

  document
    .querySelector<HTMLFormElement>('.js-effective-uid-form')
    ?.addEventListener('submit', (e) => {
      e.preventDefault();

      const effectiveUid = effectiveUidInput?.value.trim();
      if (effectiveUid) {
        setCookie(['pl_requested_uid', 'pl2_requested_uid'], effectiveUid);
        setCookie(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
        location.reload();
      }
    });
});
