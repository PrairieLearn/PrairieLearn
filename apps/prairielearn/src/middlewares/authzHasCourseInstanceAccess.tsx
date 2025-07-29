import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

import { PageLayout } from '../components/PageLayout.js';
import { getPageContext } from '../lib/client/page-context.js';
import { Hydrate } from '../lib/preact.js';

import { AuthzAccessMismatch } from './AuthzAccessMismatch.js';

export default function (req: Request, res: Response, next: NextFunction) {
  const effectiveAccess =
    res.locals.authz_data.has_course_permission_preview ||
    res.locals.authz_data.has_course_instance_permission_view ||
    res.locals.authz_data.has_student_access_with_enrollment;

  const authenticatedAccess =
    res.locals.authz_data.authn_has_course_permission_preview ||
    res.locals.authz_data.authn_has_course_instance_permission_view ||
    res.locals.authz_data.authn_has_student_access_with_enrollment;

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
            <AuthzAccessMismatch errorMessage="Access denied" />
          </Hydrate>
        ),
      }),
    );
    return;
  } else {
    return next(new HttpStatusError(403, 'Access denied'));
  }
}
