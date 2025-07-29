/**
 * This middleware checks if the authenticated user has the required permissions
 * to access the page, but the effective user does not. If so, it shows a
 * friendly error message instead of a generic 403 error.
 */

import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

import { PageLayout } from '../components/PageLayout.js';
import { getPageContext } from '../lib/client/page-context.js';
import { Hydrate } from '../lib/preact.js';

import { AuthzAccessMismatch } from './AuthzAccessMismatch.js';

export const createAuthzMiddleware =
  ({
    oneOfPermissions,
    errorMessage,
    cosmeticOnly,
  }: {
    oneOfPermissions: string[];
    errorMessage: string;
    cosmeticOnly: boolean;
  }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const effectiveAccess = oneOfPermissions.some((permission) => {
      // This is special-cased because the middleware that sets authz_data
      // may not have run yet.
      // TODO: improve typing and structure of authz_data to avoid this.
      if (permission === 'is_administrator') {
        return res.locals.is_administrator;
      }
      return res.locals.authz_data[permission];
    });

    const authenticatedAccess = oneOfPermissions.some((permission) => {
      // This is special-cased because the middleware that sets authz_data
      // may not have run yet.
      // TODO: improve typing and structure of authz_data to avoid this.
      if (permission === 'is_administrator') {
        return res.locals.authn_is_administrator;
      }
      return res.locals.authz_data['authn_' + permission];
    });

    if (effectiveAccess) {
      return next();
    } else if (authenticatedAccess && !req.cookies.pl_test_user) {
      const pageContext = getPageContext(res.locals);

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
                errorMessage={errorMessage}
                authzData={pageContext.authz_data}
                authnUser={pageContext.authn_user}
              />
            </Hydrate>
          ),
        }),
      );
      return;
    }

    if (cosmeticOnly) {
      return next();
    }

    return next(new HttpStatusError(403, errorMessage));
  };
