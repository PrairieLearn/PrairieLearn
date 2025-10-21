import './lib/htmx';
import 'htmx-ext-loading-states/dist/loading-states.js';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { removeCookieClient, setCookieClient } from '../../src/lib/client/cookie.js';

onDocumentReady(() => {
  const usernameNav = document.getElementById('username-nav');
  // The navbar is not present in some pages (e.g., workspace pages), in that case we do nothing.
  if (!usernameNav) return;

  const accessAsAdministrator = usernameNav.dataset.accessAsAdministrator === 'true';
  const viewType = usernameNav.dataset.viewType;
  const authnCourseRole = usernameNav.dataset.authnCourseRole;
  const authnCourseInstanceRole = usernameNav.dataset.authnCourseInstanceRole;
  // Note: this corresponds to `user_with_requested_uid_has_instructor_access_to_course_instance`.
  // Be careful what you use it for.
  const hasInstructorAccess = usernameNav.dataset.hasInstructorAccess === 'true';

  document.querySelector('#navbar-load-from-disk')?.addEventListener('click', () => {
    removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    removeCookieClient(['pl_requested_date', 'pl2_requested_date']);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
  });

  document.querySelector('#navbar-administrator-toggle')?.addEventListener('click', () => {
    if (accessAsAdministrator) {
      setCookieClient(['pl_access_as_administrator', 'pl2_access_as_administrator'], 'inactive');
      setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    } else {
      setCookieClient(['pl_access_as_administrator', 'pl2_access_as_administrator'], 'active');
      setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    }
    location.reload();
  });

  document.querySelector('#navbar-reset-view')?.addEventListener('click', () => {
    removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    removeCookieClient(['pl_requested_date', 'pl2_requested_date']);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-authn-instructor')?.addEventListener('click', () => {
    removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document
    .querySelector('#navbar-user-view-authn-student-no-rules')
    ?.addEventListener('click', () => {
      removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
      removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
      removeCookieClient([
        'pl_requested_course_instance_role',
        'pl2_requested_course_instance_role',
      ]);
      setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

      if (viewType === 'student') {
        location.reload();
      }
    });

  document.querySelector('#navbar-user-view-authn-student')?.addEventListener('click', () => {
    removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
    setCookieClient(['pl_requested_course_role', 'pl2_requested_course_role'], 'None');
    setCookieClient(
      ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'],
      'None',
    );
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-instructor')?.addEventListener('click', () => {
    removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student-no-rules')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
      removeCookieClient([
        'pl_requested_course_instance_role',
        'pl2_requested_course_instance_role',
      ]);
    } else {
      if (authnCourseRole && authnCourseInstanceRole) {
        setCookieClient(['pl_requested_course_role', 'pl2_requested_course_role'], authnCourseRole);
        setCookieClient(
          ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'],
          authnCourseInstanceRole,
        );
      }
    }

    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      setCookieClient(['pl_requested_course_role', 'pl2_requested_course_role'], 'None');
      setCookieClient(
        ['pl_requested_course_instance_role', 'pl2_requested_course_instance_role'],
        'None',
      );
    } else {
      removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
      removeCookieClient([
        'pl_requested_course_instance_role',
        'pl2_requested_course_instance_role',
      ]);
    }

    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');

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

      removeCookieClient([cookieName, cookieName.replace(/^pl_/, 'pl2_')]);

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
        setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], effectiveUid);
        setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
        location.reload();
      }
    });
});
