import { type PublicFetchInit, publicFetch } from '@prairielearn/public-fetch';

import { config } from './config.js';

export async function ltiFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (config.devMode) {
    return fetch(input, init);
  }

  const request = new Request(input, init);
  // A Request is also a RequestInit dictionary; retain its inherited getters.
  const options = typeof input === 'string' || input instanceof URL ? init : request;
  return publicFetch(request.url, options as PublicFetchInit);
}
