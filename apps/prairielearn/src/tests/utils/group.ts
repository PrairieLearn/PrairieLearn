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
  formContainer = 'body',
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

  // Try to find a CSRF token from a specific form first. If no matching form
  // is found (e.g. because the form lives inside a React modal that isn't
  // server-rendered), fall back to the page-level test CSRF token span.
  const form =
    $(`form[name="${formName}"]`).get(0) ??
    $(formContainer).find('form').get(0) ??
    $(formContainer).closest('form').get(0);

  const csrfTokenElement = form ? $(form).find('input[name="__csrf_token"]') : undefined;
  const csrfToken = csrfTokenElement?.attr('value') ?? getCSRFToken($);
  assert.ok(csrfToken);

  return { $, csrfToken };
}
