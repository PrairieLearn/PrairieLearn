import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

export default function (req: Request, res: Response, next: NextFunction) {
  if (!res.locals.authz_data.has_course_permission_preview) {
    return next(new HttpStatusError(403, 'Requires course preview access'));
  }
  next();
}
