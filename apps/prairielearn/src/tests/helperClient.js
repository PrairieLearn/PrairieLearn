const fetch = require('node-fetch');
const assert = require('chai').assert;
const cheerio = require('cheerio');
const { config } = require('../lib/config');

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
module.exports.fetchCheerio = async (url, options = {}) => {
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
  response.$ = cheerio.load(text);
  // response.text() can only be called once, which we already did.
  // patch this so consumers can use it as normal.
  response.text = () => text;
  return response;
};

/**
 * Utility function that extracts a CSRF token from a `__csrf_token` input
 * that is a descendent of the `parentSelector`, if one is specified.
 * The token will also be persisted to `context.__csrf_token`.
 */
module.exports.extractAndSaveCSRFToken = (context, $, parentSelector = '') => {
  const csrfTokenInput = $(`${parentSelector} input[name="__csrf_token"]`);
  assert.lengthOf(csrfTokenInput, 1);
  const csrfToken = csrfTokenInput.val();
  assert.isString(csrfToken);
  context.__csrf_token = csrfToken;
  return csrfToken;
};

/**
 * Utility function that extracts a CSRF token from a `__csrf_token` input
 * that is inside the data-content attribute of the parentSelector.
 * The token will also be persisted to `context.__csrf_token`.
 */
module.exports.extractAndSaveCSRFTokenFromDataContent = (context, $, parentSelector) => {
  const parent = $(parentSelector);
  assert.lengthOf(parent, 1);
  const inner$ = cheerio.load(parent[0].attribs['data-content']);
  const csrfTokenInput = inner$('input[name="__csrf_token"]');
  assert.lengthOf(csrfTokenInput, 1);
  const csrfToken = csrfTokenInput.val();
  assert.isString(csrfToken);
  context.__csrf_token = csrfToken;
  return csrfToken;
};

/**
 * Utility function that extracts a variant ID from a `__variant_id` input
 * that is a descendent of the `parentSelector`, if one is specified.
 * The token will also be persisted to `context.__variant_id`.
 */
module.exports.extractAndSaveVariantId = (context, $, parentSelector = '') => {
  const variantIdInput = $(`${parentSelector} input[name="__variant_id"]`);
  assert.lengthOf(variantIdInput, 1);
  const variantId = variantIdInput.val();
  assert.isString(variantId);
  context.__variant_id = variantId;
  return variantId;
};

/**
 * @typedef {Object} User
 * @property {string | null} authUid
 * @property {string | null} authName
 * @property {string | null} authUin
 */

/**
 * Set the current user in the config.
 *
 * @param {User} user
 */
module.exports.setUser = (user) => {
  config.authUid = user.authUid;
  config.authName = user.authName;
  config.authUin = user.authUin;
};

/**
 * Get instance question id from URL params.
 *
 * @param {string} url
 * @returns number
 */
module.exports.parseInstanceQuestionId = (url) => {
  const iqId = parseInt(url.match(/instance_question\/(\d+)/)[1]);
  assert.isNumber(iqId);
  return iqId;
};

/**
 * Acts as 'save' or 'save and grade' button click on student instance question page.
 *
 * @param {string} instanceQuestionUrl The instance question url the student is answering the question on.
 * @param {Record<string, any>} payload JSON data structure type formed on the basis of the question
 * @param {'save' | 'grade'} action The action to take
 * @param {{ name: string, contents: string }[]} [fileData] File data to submit to the question
 */
module.exports.saveOrGrade = async (instanceQuestionUrl, payload, action, fileData) => {
  const $instanceQuestionPage = cheerio.load(await (await fetch(instanceQuestionUrl)).text());
  const token = $instanceQuestionPage('form > input[name="__csrf_token"]').val();
  const variantId = $instanceQuestionPage('form > input[name="__variant_id"]').val();
  const fileUploadInputName = $instanceQuestionPage('input[name^=_file_upload]').attr('name');

  // handles case where __variant_id should exist inside postData on only some instance questions submissions
  if (payload && payload.postData) {
    payload.postData = JSON.parse(payload.postData);
    payload.postData.variant.id = variantId;
    payload.postData = JSON.stringify(payload.postData);
  }

  return fetch(instanceQuestionUrl, {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      __variant_id: variantId,
      __action: action,
      __csrf_token: token,
      ...(fileData ? { [fileUploadInputName]: JSON.stringify(fileData) } : {}),
      ...payload,
    }).toString(),
  });
};
