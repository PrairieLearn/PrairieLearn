import { type NextFunction, type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

export default function (req: Request, res: Response, next: NextFunction) {
  if (!res.locals.is_administrator) {
    console.dir(res.locals, { depth: null });
    console.log(req.headers);
    console.log(req.cookies);
    return next(new HttpStatusError(403, 'Requires administrator privileges'));
  }
  next();
}
