import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { assert } from 'vitest';

import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../lib/config.js';

export async function getCsrfToken(url: string) {
  const res = await fetch(url);
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $('span[id=test_csrf_token]').text();
}

/**
 * Generates a CSRF token for the given URL and authentication user ID.
 * This is useful for testing pages which only have a POST handler,
 * e.g. `instructorCopyPublicCourseInstance.ts`.
 *
 * Most pages can use the `getCsrfToken` function to extract the CSRF token from the page.
 */
export function generateCsrfToken({ url, authnUserId }: { url: string; authnUserId: string }) {
  const tokenData = {
    // We don't want to include the query params in the CSRF token checks.
    url: url.split('?')[0],
    authn_user_id: authnUserId,
  };

  return generateSignedToken(tokenData, config.secretKey);
}
