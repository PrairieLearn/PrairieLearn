/**
 * This middleware checks if the authenticated user has the required permissions
 * to access the page, but the effective user does not. If so, it shows a
 * friendly error message instead of a generic 403 error.
 */

import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../components/PageLayout.js';
import { getPageContext } from '../lib/client/page-context.js';

import {
  AuthzAccessMismatch,
  type CheckablePermissionKeys,
  getErrorExplanation,
} from './AuthzAccessMismatch.js';
import { getRedirectForEffectiveAccessDenied } from './redirectEffectiveAccessDenied.js';

export const createAuthzMiddleware =
  ({
    oneOfPermissions,
    errorExplanation,
    unauthorizedUsers,
  }: {
    oneOfPermissions: CheckablePermissionKeys[];
    errorExplanation?: string;
    unauthorizedUsers: 'passthrough' | 'block';
  }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const hasAuthzData = res.locals.authz_data != null;
    // This is special-cased because the middleware that sets authz_data
    // may not have run yet.
    const authzData = res.locals.authz_data ?? {
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authn_is_administrator,
    };

    const effectiveAccess = oneOfPermissions.some((permission) => authzData[permission]);

    const authenticatedAccess = oneOfPermissions.some(
      (permission) => authzData['authn_' + permission],
    );

    if (effectiveAccess) {
      next();
      return;
    }

    // If we don't have authz data from the request, we fallback to the non-friendly error page.
    // We also do this fallback if we are in a test.
    if (authenticatedAccess && !req.cookies.pl_test_user && hasAuthzData) {
      const pageContext = getPageContext(res.locals);

      // Try to redirect to an accessible page. If we can't, then show the error page.
      const redirectUrl = getRedirectForEffectiveAccessDenied(res);
      if (redirectUrl) {
        res.redirect(redirectUrl);
        return;
      }

      res.status(403).send(
        PageLayout({
          resLocals: res.locals,
          navContext: {
            type: pageContext.navbarType,
            page: 'error',
          },
          pageTitle: 'Insufficient access',
          content: (
            <Hydrate>
              <AuthzAccessMismatch
                errorExplanation={errorExplanation}
                oneOfPermissionKeys={oneOfPermissions}
                authzData={authzData}
                authnUser={pageContext.authn_user}
                authzUser={authzData.user ?? null}
              />
            </Hydrate>
          ),
        }),
      );
      return;
    }

    if (unauthorizedUsers === 'passthrough') {
      next();
      return;
    }

    next(new HttpStatusError(403, errorExplanation ?? getErrorExplanation(oneOfPermissions)));
  };
