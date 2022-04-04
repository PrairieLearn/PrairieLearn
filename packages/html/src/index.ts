import ejs from 'ejs';
import path from 'path';

function escapeValue(value: unknown): string {
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
export class HtmlSafeString {
  private readonly strings: ReadonlyArray<string>;
  private readonly values: unknown[];

  constructor(strings: ReadonlyArray<string>, values: unknown[]) {
    this.strings = strings;
    this.values = values;
  }

  toString(): string {
    return this.values.reduce<string>((acc, val, i) => {
      return acc + escapeValue(val) + this.strings[i + 1];
    }, this.strings[0]);
  }
}

export function html(strings: TemplateStringsArray, ...values: any[]): HtmlSafeString {
  return new HtmlSafeString(strings, values);
}

/**
 * Pre-escpapes the rendered HTML. Useful for when you want to inline the HTML
 * in something else, for instance in a `data-content` attribute for a Bootstrap
 * popover.
 */
export function escapeHtml(html: HtmlSafeString): HtmlSafeString {
  return unsafeHtml(ejs.escapeXML(html.toString()));
}

/**
 * Will render the provided value without any additional escaping. Use carefully
 * with user-provided data.
 *
 * @param value The value to render.
 * @returns An {@link HtmlSafeString} representing the provided value.
 */
export function unsafeHtml(value: string): HtmlSafeString {
  return new HtmlSafeString([value], []);
}

/**
 * This is a shim to allow for the use of EJS templates inside of HTML tagged
 * template literals.
 *
 * The resulting string is assumed to be appropriately escaped and will be used
 * verbatim in the resulting HTML.
 *
 * @param filename The name of the file from which relative includes should be resolved.
 * @param template The raw EJS template string.
 * @param data Any data to be made available to the template.
 * @returns The rendered EJS.
 */
export function renderEjs(filename: string, template: string, data: any = {}): HtmlSafeString {
  return unsafeHtml(ejs.render(template, data, { views: [path.dirname(filename)] }));
}
