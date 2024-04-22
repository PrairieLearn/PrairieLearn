// @ts-check
import { AugmentedError } from '@prairielearn/error';

/**
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
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
