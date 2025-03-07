import { type RequestHandler } from 'express';

import { isEnterprise } from '../lib/license.js';

export function enterpriseOnly<T>(load: () => T): T | RequestHandler {
  if (isEnterprise()) {
    return load();
  }
  return (req, res, next) => next();
}
