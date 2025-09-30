import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

export default function (req: Request, res: Response, next: NextFunction) {
  // We're not using the authz middleware helper because this page uses
  // permissions from the authenticated user, not the effective user.
  if (
    !res.locals.authz_data.authn_has_course_permission_preview &&
    !res.locals.authz_data.authn_has_course_instance_permission_view
  ) {
    return next(
      new HttpStatusError(403, 'Requires either course preview access or student data view access'),
    );
  }
  next();
}
