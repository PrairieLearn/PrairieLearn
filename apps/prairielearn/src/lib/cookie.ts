import type { Request } from 'express';

import { config } from './config';

export function shouldSecureCookie(req: Request): boolean {
  // In production, always set secure: true. Otherwise, only set it to true if
  // the request is made over HTTPS.
  //
  // `req.protocol` should reflect Express' `trust proxy` setting, which should
  // be used when the app is behind a reverse proxy or load balancer.
  return !config.devMode || req.protocol === 'https';
}
