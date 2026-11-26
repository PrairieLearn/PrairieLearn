import { type NextFunction, type Request, type Response } from 'express';

import { config } from '../lib/config.js';

export interface ResLocalsDate {
  req_date: Date;
  true_req_date: Date;
  requestReceivedAt: Date;
}

/** Preserves the emulated clock while accounting for time spent processing this request. */
export function getCurrentRequestDate(
  locals: Pick<ResLocalsDate, 'req_date' | 'true_req_date'>,
): Date {
  return new Date(Date.now() + locals.req_date.getTime() - locals.true_req_date.getTime());
}

/** Applies an emulated request clock to the time recorded before body parsing. */
export function getRequestReceivedDate(locals: ResLocalsDate): Date {
  return new Date(
    locals.requestReceivedAt.getTime() + locals.req_date.getTime() - locals.true_req_date.getTime(),
  );
}

export default function (req: Request, res: Response, next: NextFunction) {
  res.locals.req_date = new Date();
  res.locals.true_req_date = res.locals.req_date;
  res.locals.requestReceivedAt ??= res.locals.true_req_date;

  // We allow unit tests to override the req_date. Unit tests may also override the user
  // (middlewares/authn.js) and the req_mode (middlewares/authzCourseOrInstance.js).
  if (config.devMode && req.cookies.pl_test_date) {
    res.locals.req_date = new Date(Date.parse(req.cookies.pl_test_date));
  }

  next();
}
