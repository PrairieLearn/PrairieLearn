const ejs = require('ejs');
const path = require('path');

/**
 * Escapes the given value. Can handle strings, numbers, arrays, and instances
 * of {@link HtmlSafeString}.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeValue(value) {
  if (value instanceof HtmlSafeString) {
    // Already escaped!
    return value.toString();
  } else if (Array.isArray(value)) {
    return value.map((val) => escapeValue(val)).join('');
  } else if (typeof value === 'string' || typeof value === 'number') {
    return ejs.escapeXML(String(value));
  } else if (typeof value === 'object') {
    throw new Error('Cannot interpolate object in template');
  } else {
    // This is undefined, null, or a boolean - don't render anything here.
    return '';
  }
}

// Based on https://github.com/Janpot/escape-html-template-tag
class HtmlSafeString {
  /**
   * Constructs a new {@link HtmlSafeString} instance.
   *
   * @param {ReadonlyArray<string>} strings
   * @param {unknown[]} values
   */
  constructor(strings, values) {
    this.strings = strings;
    this.values = values;
  }

  /**
   * Renders the given {@link HtmlSafeString} to a string.
   *
   * @returns {string}
   */
  toString() {
    return this.values.reduce((acc, val, i) => {
      return acc + escapeValue(val) + this.strings[i + 1];
    }, this.strings[0]);
  }
}

/**
 *
 * @param {TemplateStringAray} strings
 * @param {...any} values
 * @returns  {HtmlSafeString}
 */
module.exports.html = function html(strings, ...values) {
  return new HtmlSafeString(strings, values);
};

/**
 * Pre-escpapes the rendered HTML. Useful for when you want to inline the HTML
 * in something else, for instance in a `data-content` attribute for a Bootstrap
 * popover.
 *
 * @param html {HtmlSafeString} The HTML to be escaped.
 * @returns {HtmlSafeString} The escaped HTML.
 */
module.exports.escapeHtml = function escapeHtml(html) {
  return module.exports.unsafeHtml(ejs.escapeXML(html.toString()));
};

/**
 * Will render the provided value without any additional escaping. Use carefully
 * with user-provided data.
 *
 * @param value {string} The value to render.
 * @returns {HtmlSafeString} An {@link HtmlSafeString} representing the provided value.
 */
module.exports.unsafeHtml = function unsafeHtml(value) {
  return new HtmlSafeString([value], []);
};

/**
 * This is a shim to allow for the use of EJS templates inside of HTML tagged
 * template literals.
 *
 * The resulting string is assumed to be appropriately escaped and will be used
 * verbatim in the resulting HTML.
 *
 * @param filename {string} The name of the file from which relative includes should be resolved.
 * @param template {string} The raw EJS template string.
 * @param data {any} Any data to be made available to the template.
 * @returns {HtmlSafeString} The rendered EJS.
 */
module.exports.renderEjs = function renderEjs(filename, template, data = {}) {
  return module.exports.unsafeHtml(ejs.render(template, data, { views: [path.dirname(filename)] }));
};
