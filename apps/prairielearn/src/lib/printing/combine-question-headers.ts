import { load } from 'cheerio';
import { z } from 'zod';

import { html, unsafeHtml } from '@prairielearn/html';

/** Development asset URLs use a fresh UUID for each render, even for the same package file. */
function sameDevelopmentModuleAsset(first: string, second: string): boolean {
  const pattern = /^(.*\/node_modules\/)[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\/(.+)$/i;
  const firstMatch = pattern.exec(first);
  const secondMatch = pattern.exec(second);
  return (
    firstMatch !== null &&
    secondMatch !== null &&
    firstMatch[1] === secondMatch[1] &&
    firstMatch[2] === secondMatch[2]
  );
}

export function combineQuestionHeaders(questionHeaders: readonly string[]): string {
  const extraHeaderHtmls = new Set<string>();
  for (const extraHeadersHtml of questionHeaders) {
    for (const extraHeaderHtml of extraHeadersHtml.split('\n')) {
      const trimmedExtraHeaderHtml = extraHeaderHtml.trim();
      if (trimmedExtraHeaderHtml) extraHeaderHtmls.add(trimmedExtraHeaderHtml);
    }
  }

  // Questions share one module namespace. Reject conflicting mappings and register
  // all question dependencies before their element scripts run.
  const headers = load([...extraHeaderHtmls].join('\n'), null, false);
  const imports: Record<string, string> = {};
  headers('script[type="importmap"]').each((_, element) => {
    const importMap = z
      .object({ imports: z.record(z.string(), z.string()) })
      .parse(JSON.parse(headers(element).text()));
    for (const [specifier, url] of Object.entries(importMap.imports)) {
      if (
        imports[specifier] &&
        imports[specifier] !== url &&
        !sameDevelopmentModuleAsset(imports[specifier], url)
      ) {
        throw new Error(`Questions use conflicting import maps for ${specifier}`);
      }
      imports[specifier] = url;
    }
    headers(element).remove();
  });

  return html`
    ${
      Object.keys(imports).length > 0
        ? html`<script type="importmap">
            ${unsafeHtml(JSON.stringify({ imports }))}
          </script>`
        : ''
    }
    ${unsafeHtml(headers.html())}
  `.toString();
}
