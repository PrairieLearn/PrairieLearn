import { logger } from '@prairielearn/logger';
import { type PublicFetchInit, publicFetch } from '@prairielearn/public-fetch';

import { config } from './config.js';

export async function ltiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (config.devMode && config.ltiDevAllowedOrigins.includes(url.origin)) {
    return fetch(request, { redirect: 'manual' });
  }

  try {
    // Preserve replayable bodies for redirects; only adapt Request objects across implementations.
    const options =
      typeof input === 'string' || input instanceof URL
        ? init
        : {
            method: request.method,
            headers: Object.fromEntries(request.headers),
            body: request.body,
            duplex: 'half',
            signal: request.signal,
            redirect: request.redirect,
            cache: request.cache,
            credentials: request.credentials,
            integrity: request.integrity,
            keepalive: request.keepalive,
            mode: request.mode,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
          };
    return (await publicFetch(request.url, options as PublicFetchInit)) as unknown as Response;
  } catch (error) {
    let cause = error;
    while (cause instanceof Error) {
      if (cause.message === 'Host did not resolve to a public address') {
        // Do not log query strings, which can contain credentials or student information.
        logger.warn(`Blocked LTI request to a non-public address (SSRF protection): ${url.origin}`);
        break;
      }
      cause = cause.cause;
    }
    throw error;
  }
}
