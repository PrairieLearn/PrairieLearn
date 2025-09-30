import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../components/PageLayout.js';
import { getPageContext } from '../lib/client/page-context.js';

import { AuthzAccessMismatch } from './AuthzAccessMismatch.js';
import { getRedirectForEffectiveAccessDenied } from './redirectEffectiveAccessDenied.js';

export async function authzHasCoursePreviewOrInstanceView(
  req: Request,
  res: Response,
): Promise<
  { type: 'success' } | { type: 'redirect'; url: string } | { type: 'body'; html: string }
> {
  const effectiveAccess =
    res.locals.authz_data.has_course_permission_preview ||
    res.locals.authz_data.has_course_instance_permission_view;

  const authenticatedAccess =
    res.locals.authz_data.authn_has_course_permission_preview ||
    res.locals.authz_data.authn_has_course_instance_permission_view;

  if (effectiveAccess) {
    return { type: 'success' };
  } else if (
    authenticatedAccess &&
    // This is a dumb hack to work around the fact that this function is called from
    // the `authzWorkspace` middleware. That middleware is mounted on the container
    // proxy paths, but our CSRF middleware intentionally doesn't run there. The
    // `getPageContext` function requires a CSRF token to be present, so we can't
    // safely call it without one.
    //
    // If a CSRF token is not present, we fall through to the error below.
    res.locals.__csrf_token
  ) {
    // Try to redirect to an accessible page. If we can't, then show the error page.
    const redirectUrl = getRedirectForEffectiveAccessDenied(res);
    if (redirectUrl) {
      return { type: 'redirect', url: redirectUrl };
    }

    const pageContext = getPageContext(res.locals);
    return {
      type: 'body',
      html: PageLayout({
        resLocals: res.locals,
        navContext: {
          type: pageContext.navbarType,
          page: 'error',
        },
        pageTitle: 'Insufficient access',
        content: (
          <Hydrate>
            <AuthzAccessMismatch
              oneOfPermissionKeys={[
                'has_course_permission_preview',
                'has_course_instance_permission_view',
              ]}
              authzData={pageContext.authz_data}
              authnUser={pageContext.authn_user}
              authzUser={pageContext.authz_data.user}
            />
          </Hydrate>
        ),
      }),
    };
  } else {
    throw new error.HttpStatusError(
      403,
      'Requires either course preview access or student data view access',
    );
  }
}

export default asyncHandler(async (req, res, next) => {
  const result = await authzHasCoursePreviewOrInstanceView(req, res);
  if (result.type === 'body') {
    res.status(403).send(result.html);
  } else if (result.type === 'redirect') {
    res.redirect(result.url);
  } else {
    next();
  }
});
