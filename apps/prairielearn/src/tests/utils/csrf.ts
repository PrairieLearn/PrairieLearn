import fetch from 'node-fetch';
import { assert } from 'vitest';

import * as cheerio from '../utils/cheerio.js';

export async function getCsrfToken(url: string) {
  const res = await fetch(url);
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $('span[id=test_csrf_token]').text();
}
