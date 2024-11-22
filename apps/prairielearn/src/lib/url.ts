import { type Request } from 'express';

import { config } from './config.ts';

export function getCanonicalHost(req: Request): string {
  if (config.serverCanonicalHost) return config.serverCanonicalHost;
  return `${req.protocol}://${req.get('host')}`;
}
