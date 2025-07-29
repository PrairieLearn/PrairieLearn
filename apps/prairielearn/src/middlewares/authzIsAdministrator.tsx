import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

import { PageLayout } from '../components/PageLayout.js';
import { getPageContext } from '../lib/client/page-context.js';
import { Hydrate } from '../lib/preact.js';

import { AuthzAccessMismatch } from './AuthzAccessMismatch.js';

export default function (req: Request, res: Response, next: NextFunction) {
  const effectiveAccess = res.locals.is_administrator;
  const authenticatedAccess = res.locals.authn_is_administrator;

  if (effectiveAccess) {
    return next();
  } else if (authenticatedAccess) {
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
              errorMessage="Requires administrator privileges"
              authzData={pageContext.authz_data}
              authnUser={pageContext.authn_user}
            />
          </Hydrate>
        ),
      }),
    );
    return;
  } else {
    return next(new HttpStatusError(403, 'Requires administrator privileges'));
  }
}
