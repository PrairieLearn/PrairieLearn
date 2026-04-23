import * as cheerio from 'cheerio';
import { assert } from 'vitest';

import { config } from '../../lib/config.js';
import type { User } from '../../lib/db-types.js';
import { getCSRFToken } from '../helperClient.js';

/**
 * Switches active user and loads assessment, returning the user's CSRF
 * token value from a form on the page.
 */
export async function switchUserAndLoadAssessment(
  studentUser: User,
  assessmentUrl: string,
  formName: string | null,
): Promise<{ $: cheerio.CheerioAPI; csrfToken: string }> {
  // Load config
  config.authUid = studentUser.uid;
  config.authName = studentUser.name;
  config.authUin = studentUser.uin;

  // Load assessment
  const res = await fetch(assessmentUrl);
  assert.isOk(res.ok);
  const page = await res.text();
  const $ = cheerio.load(page);

  // When a specific form is requested, only look up that form and fail if it's
  // missing. Otherwise fall back to the nearest form or the page-level token.
  const form = formName != null ? $(`form[name="${formName}"]`).get(0) : undefined;

  if (formName != null) {
    assert.ok(form, `Expected form "${formName}" to be present`);
  }

  const csrfTokenElement = form ? $(form).find('input[name="__csrf_token"]') : undefined;
  const csrfToken =
    formName != null
      ? csrfTokenElement?.attr('value')
      : (csrfTokenElement?.attr('value') ?? getCSRFToken($));
  assert.ok(csrfToken);

  return { $, csrfToken };
}
