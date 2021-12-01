const fetch = require('node-fetch');
const assert = require('chai').assert;
const cheerio = require('cheerio');
const querystring = require('querystring');

module.exports = {};

/**
 * A wrapper around node-fetch that provides a few features:
 * * Automatic parsing with cheerio
 * * A `form` option akin to that from the `request` library
 *
 * Here is an example of how to set cookies, if desired:
 *  options.headers = {cookie: 'pl_access_as_administrator=active'};
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
 * Acts as 'save' or 'save and grade' button click on student instance question page.
 * @param {string} instanceQuestionUrl the instance question url the student is answering the question on.
 * @param {object} payload json data structure type formed on the basis of the question
 * @param {string} 'save' or 'grade' enums
 * @param {array<object>}  (optional) ie. [{name: 'fib.py', 'contents': Buffer.from(fibFileContents).toString('base64')}]
 */
module.exports.saveOrGrade = async (instanceQuestionUrl, payload, action, fileData) => {
  const $instanceQuestionPage = cheerio.load(await (await fetch(instanceQuestionUrl)).text());
  const token = $instanceQuestionPage('form > input[name="__csrf_token"]').val();
  const variantId = $instanceQuestionPage('form > input[name="__variant_id"]').val();
  const uploadSuffix = $instanceQuestionPage('input[name^=_file_upload]').attr('name');

  // handles case where __variant_id should exist inside postData on only some instance questions submissions
  if (payload && payload.postData) {
    payload.postData = JSON.parse(payload.postData);
    payload.postData.variant.id = variantId;
    payload.postData = JSON.stringify(payload.postData);
  }

  return fetch(instanceQuestionUrl, {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    body: [
      '__variant_id=' + variantId,
      '__action=' + action,
      '__csrf_token=' + token,
      fileData ? uploadSuffix + '=' + encodeURIComponent(JSON.stringify(fileData)) : '',
      querystring.encode(payload),
    ].join('&'),
  });
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
