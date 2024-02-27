import fetch, { RequestInit, Response } from 'node-fetch';
import { assert } from 'chai';
import * as cheerio from 'cheerio';
import { config } from '../lib/config';

interface CheerioResponse extends Response {
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
 * options.headers = {cookie: 'pl_access_as_administrator=active'};
 * ```
 */
export async function fetchCheerio(
  url: string | URL,
  options: RequestInit & { form?: Record<string, any> } = {},
): Promise<CheerioResponse> {
  if (options.form) {
    options.body = JSON.stringify(options.form);
    options.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    delete options.form;
  }
  const response = await fetch(url, options);
  const text = await response.text();

  const cheerioResponse = response as CheerioResponse;
  cheerioResponse.$ = cheerio.load(text);
  cheerioResponse.text = () => Promise.resolve(text);
  return cheerioResponse;
}

/**
 * Gets the test CSRF token from the page.
 */
export function getCSRFToken($: cheerio.CheerioAPI): string {
  const csrfTokenSpan = $('span#test_csrf_token');
  assert.lengthOf(csrfTokenSpan, 1);
  const csrfToken = csrfTokenSpan.text();
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
  const csrfTokenInput = $(`${parentSelector} input[name="__csrf_token"]`);
  assert.lengthOf(csrfTokenInput, 1);
  const csrfToken = csrfTokenInput.val();
  assert.isString(csrfToken);
  context.__csrf_token = csrfToken;
  return csrfToken as string;
}

/**
 * Utility function that extracts a CSRF token from a `__csrf_token` input
 * that is inside the data-content attribute of the parentSelector.
 * The token will also be persisted to `context.__csrf_token`.
 */
export function extractAndSaveCSRFTokenFromDataContent(
  context: Record<string, any>,
  $: cheerio.CheerioAPI,
  parentSelector: string,
): string {
  const parent = $(parentSelector);
  assert.lengthOf(parent, 1);
  const content = parent.attr('data-content');
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
  const iqId = parseInt(match[1]);
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
  if (payload && payload.postData) {
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
