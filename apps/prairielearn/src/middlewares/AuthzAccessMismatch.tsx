import { removeCookieClient, setCookieClient } from '../lib/client/cookie.js';

export function AuthzAccessMismatch({ errorMessage }: { errorMessage: string }) {
  const clearEffectiveUserCookies = () => {
    removeCookieClient(['pl_requested_uid', 'pl2_requested_uid']);
    removeCookieClient(['pl_requested_course_role', 'pl2_requested_course_role']);
    removeCookieClient(['pl_requested_course_instance_role', 'pl2_requested_course_instance_role']);
    removeCookieClient(['pl_requested_date', 'pl2_requested_date']);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.reload();
  };
  return (
    <main id="content" class="container">
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">Insufficient access</div>
        <div class="card-body">
          <h2 class="mb-3 h4">{errorMessage}</h2>
          <p>
            The current effective user does not have access to this page, but the authenticated user
            does.
          </p>
          <p>To view this page, you must change the effective user.</p>
          <button type="button" class="btn btn-primary" onClick={clearEffectiveUserCookies}>
            Clear effective user
          </button>
        </div>
      </div>
    </main>
  );
}

AuthzAccessMismatch.displayName = 'AuthzAccessMismatch';
