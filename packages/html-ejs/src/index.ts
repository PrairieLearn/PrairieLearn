import path from 'path';
import { fileURLToPath } from 'url';

import ejs from 'ejs';

import { unsafeHtml, type HtmlSafeString } from '@prairielearn/html';
/**
 * This is a shim to allow for the use of EJS templates inside of HTML tagged
 * template literals.
 *
 * The resulting string is assumed to be appropriately escaped and will be used
 * verbatim in the resulting HTML.
 *
 * @param filePathOrUrl The path or file URL of the file from which relative includes should be resolved.
 * @param template The raw EJS template string.
 * @param data Any data to be made available to the template.
 * @returns The rendered EJS.
 */
export function renderEjs(filePathOrUrl: string, template: string, data: any = {}): HtmlSafeString {
  let resolvedPath = filePathOrUrl;

  // This allows for us to pass `import.meta.url` to this function in ES Modules
  // environments where `__filename` is not available.
  if (filePathOrUrl.startsWith('file://')) {
    resolvedPath = fileURLToPath(filePathOrUrl);
  }

  return unsafeHtml(ejs.render(template, data, { views: [path.dirname(resolvedPath)] }));
}
