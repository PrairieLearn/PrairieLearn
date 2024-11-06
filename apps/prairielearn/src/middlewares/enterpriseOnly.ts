import { isEnterprise } from '../lib/license.js';

export default function enterpriseOnlyMiddleware(load) {
  if (isEnterprise()) {
    return load();
  }
  return (req, res, next) => next();
}
