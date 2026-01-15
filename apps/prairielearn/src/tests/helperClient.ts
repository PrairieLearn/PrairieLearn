import * as cheerio from 'cheerio';
import fetch, { type RequestInit, type Response } from 'node-fetch';
import { assert } from 'vitest';

import { config } from '../lib/config.js';

export interface CheerioResponse extends Response {
  $: cheerio.CheerioAPI;
}

/**
 * A wrapper around node-fetch that provides a few features:
 *
 * - Automatic parsing with cheerio
 * - A `form` option akin to that from the `request` library
 *
 * If desired, you can set cookies via the `cookie` header:
 * ```
 * options.headers = {cookie: 'pl2_access_as_administrator=active'};
 * ```
 */
export async function fetchCheerio(
  url: string | URL,
  options: RequestInit = {},
): Promise<CheerioResponse> {
  const response = await fetch(url, options);
  const text = await response.text();

  const cheerioResponse = response as CheerioResponse;
  cheerioResponse.$ = cheerio.load(text);
  cheerioResponse.text = () => Promise.resolve(text);
  return cheerioResponse;
}

/**
 * Gets a CSRF token. If an {@link cheerio.CheerioAPI} is provided, the token
 * will come from the test span. Otherwise, it's assumed to be an element with
 * a single hidden CSRF input, and the return value will be the value of that input.
 */
export function getCSRFToken($: cheerio.CheerioAPI | cheerio.Cheerio<any>): string {
  if ('load' in $) {
    const csrfTokenSpan = $('span#test_csrf_token');
    assert.lengthOf(csrfTokenSpan, 1);
    const csrfToken = csrfTokenSpan.text();
    assert.isString(csrfToken);
    return csrfToken;
  }

  const csrfTokenInput = $.find('input[name="__csrf_token"]');
  assert.lengthOf(csrfTokenInput, 1);
  const csrfToken = csrfTokenInput.val();
  assert.isString(csrfToken);
  return csrfToken as string;
}

/**
 * Utility function that extracts a CSRF token from a `__csrf_token` input
 * that is a descendent of the `parentSelector`, if one is specified.
 * The token will also be persisted to `context.__csrf_token`.
 */
export function extractAndSaveCSRFToken(
  context: Record<string, any>,
  $: cheerio.CheerioAPI,
  parentSelector = '',
): string {
  const csrfToken = getCSRFToken($(parentSelector));
  context.__csrf_token = csrfToken;
  return csrfToken;
}

/**
 * Utility function that extracts a CSRF token from a `__csrf_token` input
 * that is inside the `data-bs-content` attribute of the parentSelector.
 * The token will also be persisted to `context.__csrf_token`.
 */
export function extractAndSaveCSRFTokenFromDataContent(
  context: Record<string, any>,
  $: cheerio.CheerioAPI,
  parentSelector: string,
): string {
  const parent = $(parentSelector);
  assert.lengthOf(parent, 1);
  const content = parent.attr('data-bs-content');
  assert(content);
  const inner$ = cheerio.load(content);
  const csrfTokenInput = inner$('input[name="__csrf_token"]');
  assert.lengthOf(csrfTokenInput, 1);
  const csrfToken = csrfTokenInput.val();
  assert.isString(csrfToken);
  context.__csrf_token = csrfToken;
  return csrfToken as string;
}

/**
 * Utility function that extracts a variant ID from a `__variant_id` input
 * that is a descendent of the `parentSelector`, if one is specified.
 * The token will also be persisted to `context.__variant_id`.
 */
export function extractAndSaveVariantId(
  context: Record<string, any>,
  $: cheerio.CheerioAPI,
  parentSelector = '',
): string {
  const variantIdInput = $(`${parentSelector} input[name="__variant_id"]`);
  assert.lengthOf(variantIdInput, 1);
  const variantId = variantIdInput.val();
  assert.isString(variantId);
  context.__variant_id = variantId;
  return variantId as string;
}

export interface User {
  authUid: string | null;
  authName: string | null;
  authUin: string | null;
}

/**
 * Set the current user in the config.
 */
export function setUser(user: User): void {
  config.authUid = user.authUid;
  config.authName = user.authName;
  config.authUin = user.authUin;
}

/**
 * Get instance question id from URL params.
 */
export function parseInstanceQuestionId(url: string): number {
  const match = url.match(/instance_question\/(\d+)/);
  assert(match);
  const iqId = Number.parseInt(match[1]);
  assert.isNumber(iqId);
  return iqId;
}

/**
 * Get assessment instance id from URL params.
 */
export function parseAssessmentInstanceId(url: string): number {
  const match = url.match(/assessment_instance\/(\d+)/);
  assert(match);
  const iqId = Number.parseInt(match[1]);
  assert.isNumber(iqId);
  return iqId;
}

/**
 * Acts as 'save' or 'save and grade' button click on student instance question page.
 *
 * @param instanceQuestionUrl The instance question url the student is answering the question on.
 * @param payload JSON data structure type formed on the basis of the question
 * @param action The action to take
 * @param fileData File data to submit to the question
 */
export async function saveOrGrade(
  instanceQuestionUrl: string,
  payload: Record<string, string>,
  action: 'save' | 'grade',
  fileData: { name: string; contents: string }[] | null = null,
): Promise<Response> {
  const $instanceQuestionPage = cheerio.load(await (await fetch(instanceQuestionUrl)).text());
  const token = $instanceQuestionPage('form > input[name="__csrf_token"]').val();
  const variantId = $instanceQuestionPage('form > input[name="__variant_id"]').val();
  const fileUploadInputName = $instanceQuestionPage('input[name^=_file_upload]').attr('name');
  const fileEditorInputName = $instanceQuestionPage('input[name^=_file_editor]').attr('name');

  assert(typeof token === 'string');
  assert(typeof variantId === 'string');

  // handles case where __variant_id should exist inside postData on only some instance questions submissions
  if (payload.postData) {
    const postData = JSON.parse(payload.postData);
    postData.variant.id = variantId;
    payload.postData = JSON.stringify(postData);
  }

  // Hacky: if this question is using `pl-file-editor` and not `pl-file-upload`,
  // assume a single file and massage `fileData` to match the expected format.
  const fileDataRaw: Record<string, string> = {};
  if (fileData) {
    if (fileUploadInputName) {
      fileDataRaw[fileUploadInputName] = JSON.stringify(fileData);
    } else if (fileEditorInputName) {
      fileDataRaw[fileEditorInputName] = fileData[0].contents;
    }
  }

  return fetch(instanceQuestionUrl, {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      __variant_id: variantId,
      __action: action,
      __csrf_token: token,
      ...fileDataRaw,
      ...payload,
    }).toString(),
  });
}

/**
 * Asserts that an alert exists with a given text. Normalizes the text of the
 * alert before comparing with the expected value.
 */
export function assertAlert($: cheerio.CheerioAPI, text: string, expectedLength = 1) {
  const alerts = $('.alert').filter((_, elem) =>
    $(elem).text().trim().replaceAll(/\s+/g, ' ').includes(text),
  );
  if (alerts.length !== expectedLength) {
    console.error(`Expected ${expectedLength}:`, text);
    console.error('Actual:', $('.alert').text());
  }
  assert.lengthOf(alerts, expectedLength);
}

/**
 * Generates an API access token for testing by navigating through the settings UI.
 *
 * @param baseUrl The base URL of the server (e.g., 'http://localhost:3000')
 * @param tokenName Optional name for the token (defaults to 'test')
 * @returns The generated API token
 */
export async function generateApiToken(baseUrl: string, tokenName = 'test'): Promise<string> {
  const settingsUrl = baseUrl + '/pl/settings';

  // Load the settings page
  let res = await fetch(settingsUrl);
  if (!res.ok) {
    throw new Error(`Failed to load settings page: ${res.status}`);
  }
  let page$ = cheerio.load(await res.text());

  // Find the generate token button and extract the CSRF token from its popover
  const button = page$('[data-testid="generate-token-button"]').get(0);
  if (!button) {
    throw new Error('Could not find generate-token-button');
  }

  const data$ = cheerio.load(button.attribs['data-bs-content']);
  const csrfInput = data$('form input[name="__csrf_token"]').get(0);
  const csrfToken = csrfInput?.attribs.value;
  if (!csrfToken) {
    throw new Error('Could not find CSRF token in generate token form');
  }

  // Submit the form to generate a token
  res = await fetch(settingsUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'token_generate',
      __csrf_token: csrfToken,
      token_name: tokenName,
    }),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Failed to generate token: ${res.status}`);
  }

  // Extract the token from the response
  page$ = cheerio.load(await res.text());
  const tokenContainer = page$('.new-access-token');
  if (tokenContainer.length === 0) {
    throw new Error('Could not find new-access-token container in response');
  }

  return tokenContainer.text().trim();
}
