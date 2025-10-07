import { type Request } from 'express';

import { config } from './config.js';

export function getCanonicalHost(req: Request): string {
  if (config.serverCanonicalHost) return config.serverCanonicalHost;
  return `${req.protocol}://${req.get('host')}`;
}

export function getUrl(req: Request): URL {
  return new URL(req.originalUrl, getCanonicalHost(req));
}

export function getSearchParams(req: Request): URLSearchParams {
  return new URL(req.originalUrl, getCanonicalHost(req)).searchParams;
}

export function getCourseInstanceUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}`;
}
