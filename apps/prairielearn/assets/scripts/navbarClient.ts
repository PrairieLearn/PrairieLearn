import { onDocumentReady } from '@prairielearn/browser-utils';
import Cookies from 'js-cookie';

const COOKIE_EXPIRATION_DAYS = 30;

onDocumentReady(() => {
  const usernameNav = document.getElementById('username-nav');
  const accessAsAdministrator = usernameNav.dataset.accessAsAdministrator === 'true';
  const viewType = usernameNav.dataset.viewType;
  const authnCourseRole = usernameNav.dataset.authnCourseRole;
  const authnCourseInstanceRole = usernameNav.dataset.authnCourseInstanceRole;
  // Note: this corresponds to `user_with_requested_uid_has_instructor_access_to_course_instance`.
  // Be careful what you use it for.
  const hasInstructorAccess = usernameNav.dataset.hasInstructorAccess === 'true';

  document.querySelector('#navbar-load-from-disk')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid', { path: '/' });
    Cookies.remove('pl_requested_course_role', { path: '/' });
    Cookies.remove('pl_requested_course_instance_role', { path: '/' });
    Cookies.remove('pl_requested_mode', { path: '/' });
    Cookies.remove('pl_requested_date', { path: '/' });
    Cookies.set('pl_requested_data_changed', 'true', { path: '/' });
  });

  document.querySelector('#navbar-administrator-toggle')?.addEventListener('click', () => {
    if (accessAsAdministrator) {
      Cookies.set('pl_access_as_administrator', 'inactive', {
        path: '/',
        expires: COOKIE_EXPIRATION_DAYS,
      });
      Cookies.set('pl_requested_data_changed', 'true', { path: '/' });
    } else {
      Cookies.set('pl_access_as_administrator', 'active', {
        path: '/',
        expires: COOKIE_EXPIRATION_DAYS,
      });
      Cookies.set('pl_requested_data_changed', 'true', { path: '/' });
    }
    location.reload();
  });

  document.querySelector('#navbar-reset-view')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid', { path: '/' });
    Cookies.remove('pl_requested_course_role', { path: '/' });
    Cookies.remove('pl_requested_course_instance_role', { path: '/' });
    Cookies.remove('pl_requested_mode', { path: '/' });
    Cookies.remove('pl_requested_date', { path: '/' });
    Cookies.set('pl_requested_data_changed', 'true', { path: '/' });

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-authn-instructor')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid', { path: '/' });
    Cookies.remove('pl_requested_course_role', { path: '/' });
    Cookies.remove('pl_requested_course_instance_role', { path: '/' });
    Cookies.set('pl_requested_data_changed', 'true', { path: '/' });

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document
    .querySelector('#navbar-user-view-authn-student-no-rules')
    ?.addEventListener('click', () => {
      Cookies.remove('pl_requested_uid', { path: '/' });
      Cookies.remove('pl_requested_course_role', { path: '/' });
      Cookies.remove('pl_requested_course_instance_role', { path: '/' });
      Cookies.set('pl_requested_data_changed', 'true', { path: '/' });

      if (viewType === 'student') {
        location.reload();
      }
    });

  document.querySelector('#navbar-user-view-authn-student')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_uid', { path: '/' });
    Cookies.set('pl_requested_course_role', 'None', { path: '/', expires: COOKIE_EXPIRATION_DAYS });
    Cookies.set('pl_requested_course_instance_role', 'None', {
      path: '/',
      expires: COOKIE_EXPIRATION_DAYS,
    });
    Cookies.set('pl_requested_data_changed', 'true', { path: '/' });

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-instructor')?.addEventListener('click', () => {
    Cookies.remove('pl_requested_course_role', { path: '/' });
    Cookies.remove('pl_requested_course_instance_role', { path: '/' });
    Cookies.set('pl_requested_data_changed', 'true', { path: '/' });

    if (viewType === 'instructor') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student-no-rules')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      Cookies.remove('pl_requested_course_role', { path: '/' });
      Cookies.remove('pl_requested_course_instance_role', { path: '/' });
    } else {
      Cookies.set('pl_requested_course_role', authnCourseRole, {
        path: '/',
        expires: COOKIE_EXPIRATION_DAYS,
      });
      Cookies.set('pl_requested_course_instance_role', authnCourseInstanceRole, {
        path: '/',
        expires: COOKIE_EXPIRATION_DAYS,
      });
    }

    Cookies.set('pl_requested_data_changed', 'true', { path: '/' });

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelector('#navbar-user-view-student')?.addEventListener('click', () => {
    if (hasInstructorAccess) {
      Cookies.set('pl_requested_course_role', 'None', {
        path: '/',
        expires: COOKIE_EXPIRATION_DAYS,
      });
      Cookies.set('pl_requested_course_instance_role', 'None', {
        path: '/',
        expires: COOKIE_EXPIRATION_DAYS,
      });
    } else {
      Cookies.remove('pl_requested_course_role', { path: '/' });
      Cookies.remove('pl_requested_course_instance_role', { path: '/' });
    }

    Cookies.set('pl_requested_data_changed', 'true', { path: '/' });

    if (viewType === 'student') {
      location.reload();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.js-remove-override').forEach((element) => {
    element.addEventListener('click', () => {
      const cookieName = element.dataset.overrideCookie;
      Cookies.remove(cookieName, { path: '/' });
      location.reload();
    });
  });

  const effectiveUidInput = document.querySelector<HTMLInputElement>('.js-effective-uid-input');
  const effectiveUidButton = document.querySelector<HTMLButtonElement>('.js-effective-uid-button');

  effectiveUidInput?.addEventListener('input', () => {
    if (effectiveUidInput.value.trim() !== '') {
      effectiveUidButton.removeAttribute('disabled');
    } else {
      effectiveUidButton.setAttribute('disabled', 'true');
    }
  });

  document
    .querySelector<HTMLFormElement>('.js-effective-uid-form')
    ?.addEventListener('submit', (e) => {
      e.preventDefault();

      const effectiveUid = effectiveUidInput.value.trim();
      if (effectiveUid) {
        Cookies.set('pl_requested_uid', effectiveUid, {
          path: '/',
          expires: COOKIE_EXPIRATION_DAYS,
        });
        Cookies.set('pl_requested_data_changed', 'true', { path: '/' });
        location.reload();
      }
    });
});
