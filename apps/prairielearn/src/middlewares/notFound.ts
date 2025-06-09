import { type NextFunction, type Request, type Response } from 'express';

import { AugmentedError } from '@prairielearn/error';

export default function (req: Request, res: Response, next: NextFunction) {
  next(
    new AugmentedError('Not Found', {
      status: 404,
      data: {
        url: req.url,
        method: req.method,
        authz_data: res.locals.authz_data,
      },
    }),
  );
}
