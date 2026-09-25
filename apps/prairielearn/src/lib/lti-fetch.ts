import { type PublicFetchInit, publicFetch } from '@prairielearn/public-fetch';

import { config } from './config.js';

export async function ltiFetch(input: string | URL, init?: RequestInit) {
  if (config.devMode) {
    return fetch(input, init);
  }

  return publicFetch(input, init as PublicFetchInit);
}
