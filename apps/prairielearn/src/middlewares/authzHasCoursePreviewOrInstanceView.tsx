import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { PageLayout } from '../components/PageLayout.js';
import { getPageContext } from '../lib/client/page-context.js';
import { Hydrate } from '../lib/preact.js';

import { AuthzAccessMismatch } from './AuthzAccessMismatch.js';

export async function authzHasCoursePreviewOrInstanceView(req: Request, res: Response) {
  if (
    !res.locals.authz_data.has_course_permission_preview &&
    !res.locals.authz_data.has_course_instance_permission_view
  ) {
    throw new error.HttpStatusError(
      403,
      'Requires either course preview access or student data view access',
    );
  }
}

export default asyncHandler(async (req, res, next) => {
  const effectiveAccess =
    res.locals.authz_data.has_course_permission_preview ||
    res.locals.authz_data.has_course_instance_permission_view;

  const authenticatedAccess =
    res.locals.authz_data.authn_has_course_permission_preview ||
    res.locals.authz_data.authn_has_course_instance_permission_view;

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
            <AuthzAccessMismatch errorMessage="Requires either course preview access or student data view access" />
          </Hydrate>
        ),
      }),
    );
    return;
  } else {
    throw new error.HttpStatusError(
      403,
      'Requires either course preview access or student data view access',
    );
  }
});
