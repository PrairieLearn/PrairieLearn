import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

export default function (req: Request, res: Response, next: NextFunction) {
  if (!res.locals.is_administrator) {
    return next(new HttpStatusError(403, 'Requires administrator privileges'));
  }
  next();
}
