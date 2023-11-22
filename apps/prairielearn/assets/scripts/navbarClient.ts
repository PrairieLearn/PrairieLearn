import './lib/htmx';
import 'htmx.org/dist/ext/loading-states.js';

import { onDocumentReady } from '@prairielearn/browser-utils';
import CookiesModule from 'js-cookie';

const COOKIE_EXPIRATION_DAYS = 30;

onDocumentReady(() => {
  const usernameNav = document.getElementById('username-nav');
  // The navbar is not present in some pages (e.g., workspace pages), in that case we do nothing.
  if (!usernameNav) return;

  // Ideally we'd have HTMX listen for the `show.bs.dropdown` event, but
  // Bootstrap 4 doesn't use native browser events. Once we upgrade to
  // Bootstrap 5, we can update the HTMX trigger to use the native event.
  $('#navbar-course-switcher').on('show.bs.dropdown', () => {
    document
      .getElementById('navbarDropdownMenuCourseAdminLink')
      ?.dispatchEvent(new Event('show-course-switcher'));
  });
  $('#navbar-course-instance-switcher').on('show.bs.dropdown', () => {
    document
      .getElementById('navbarDropdownMenuInstanceAdminLink')
      ?.dispatchEvent(new Event('show-course-instance-switcher'));
    document
      .getElementById('navbarDropdownMenuInstanceChooseLink')
      ?.dispatchEvent(new Event('show-course-instance-switcher'));
  });

  const Cookies = CookiesModule.withAttributes({
    path: '/',
    expires: COOKIE_EXPIRATION_DAYS,
  });

  const accessAsAdministrator = usernameNav.dataset.accessAsAdministrator === 'true';
  const viewType = usernameNav.dataset.viewType;
  const authnCourseRole = usernameNav.dataset.authnCourseRole;
  const authnCourseInstanceRole = usernameNav.dataset.authnCourseInstanceRole;
  // Note: this corresponds to `user_with_requested_uid_has_instructor_access_to_course_instance`.
  // Be careful what you use it for.
  const hasInstructorAccess = usernameNav.dataset.hasInstructorAccess === 'true';

  document.querySelector('#navbar-load-from-disk')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid');
    Cookies.remove('pl_requested_course_role');
    Cookies.remove('pl_requested_course_instance_role');
    Cookies.remove('pl_requested_mode');
    Cookies.remove('pl_requested_date');
    Cookies.set('pl_requested_data_changed', 'true');
  });

  document.querySelector('#navbar-administrator-toggle')?.addEventListener('click', () => {
    if (accessAsAdministrator) {
      Cookies.set('pl_access_as_administrator', 'inactive');
      Cookies.set('pl_requested_data_changed', 'true');
    } else {
      Cookies.set('pl_access_as_administrator', 'active');
      Cookies.set('pl_requested_data_changed', 'true');
    }
    location.reload();
  });

  document.querySelector('#navbar-reset-view')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid');
    Cookies.remove('pl_requested_course_role');
    Cookies.remove('pl_requested_course_instance_role');
    Cookies.remove('pl_requested_mode');
    Cookies.remove('pl_requested_date');
    Cookies.set('pl_requested_data_changed', 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-authn-instructor')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid');
    Cookies.remove('pl_requested_course_role');
    Cookies.remove('pl_requested_course_instance_role');
    Cookies.set('pl_requested_data_changed', 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document
    .querySelector('#navbar-user-view-authn-student-no-rules')
    ?.addEventListener('click', () => {
      Cookies.remove('pl_requested_uid');
      Cookies.remove('pl_requested_course_role');
      Cookies.remove('pl_requested_course_instance_role');
      Cookies.set('pl_requested_data_changed', 'true');

      if (viewType === 'student') {
        location.reload();
      }
    });

  document.querySelector('#navbar-user-view-authn-student')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid');
    Cookies.set('pl_requested_course_role', 'None');
    Cookies.set('pl_requested_course_instance_role', 'None');
    Cookies.set('pl_requested_data_changed', 'true');

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-instructor')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_course_role');
    Cookies.remove('pl_requested_course_instance_role');
    Cookies.set('pl_requested_data_changed', 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student-no-rules')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      Cookies.remove('pl_requested_course_role');
      Cookies.remove('pl_requested_course_instance_role');
    } else {
      if (authnCourseRole && authnCourseInstanceRole) {
        Cookies.set('pl_requested_course_role', authnCourseRole);
        Cookies.set('pl_requested_course_instance_role', authnCourseInstanceRole);
      }
    }

    Cookies.set('pl_requested_data_changed', 'true');

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      Cookies.set('pl_requested_course_role', 'None');
      Cookies.set('pl_requested_course_instance_role', 'None');
    } else {
      Cookies.remove('pl_requested_course_role');
      Cookies.remove('pl_requested_course_instance_role');
    }

    Cookies.set('pl_requested_data_changed', 'true');

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

      Cookies.remove(cookieName);
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
        Cookies.set('pl_requested_uid', effectiveUid);
        Cookies.set('pl_requested_data_changed', 'true');
        location.reload();
      }
    });
});
