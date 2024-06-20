import { type Request } from 'express';

import { config } from './config.js';

export function getCanonicalHost(req: Request): string {
  if (config.serverCanonicalHost) return config.serverCanonicalHost;
  return `${req.protocol}://${req.get('host')}`;
}
