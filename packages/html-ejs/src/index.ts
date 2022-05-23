import ejs from 'ejs';
import path from 'path';

import { unsafeHtml, type HtmlSafeString } from '@prairielearn/html';
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
