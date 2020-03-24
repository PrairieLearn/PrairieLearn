const fetch = require('node-fetch');
const assert = require('chai').assert;
const cheerio = require('cheerio');

module.exports = {};

/**
 * A wrapper around node-fetch that provides a few features:
 * * Automatic parsing with cheerio
 * * A `form` option akin to that from the `request` library
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

