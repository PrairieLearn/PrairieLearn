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

import {
  AuthzAccessMismatch,
  type CheckablePermissionKeys,
  PERMISSIONS_META,
} from './AuthzAccessMismatch.js';

function getPermissionDescription(permissionKeys: CheckablePermissionKeys[]): string {
  const descriptions = permissionKeys.map((key) => {
    const permission = PERMISSIONS_META.find((p) => p.key === key);
    return permission?.label.toLowerCase() || key.toString().replace(/_/g, ' ');
  });

  if (descriptions.length === 1) {
    return descriptions[0];
  } else if (descriptions.length === 2) {
    return descriptions.join(' or ');
  } else {
    return descriptions.slice(0, -1).join(', ') + ', or ' + descriptions.at(-1);
  }
}

function getErrorExplanation(permissionKeys: CheckablePermissionKeys[]): string {
  return `This page requires ${getPermissionDescription(permissionKeys)} permissions.`;
}

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

    if (authenticatedAccess && !req.cookies.pl_test_user) {
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
                errorExplanation={errorExplanation ?? getErrorExplanation(oneOfPermissions)}
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
