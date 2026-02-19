import * as cheerio from 'cheerio';
import { ElementType } from 'domelementtype';
import type { Element } from 'domhandler';

import { formatHtmlWithPrettier } from '../../../lib/prettier.js';

/**
 * These attributes are chosen to be preserved because they can influence the
 * interpretation of both the correct answer and a submitted response. Specifically,
 * they're relevant in questions where instructors ask students to highlight text
 * or change its color in `<pl-rich-text-editor>`.
 */
const PRESERVED_STYLE_PROPERTIES = new Set(['color', 'background-color']);

const ESCAPED_PRESERVED_STYLE_PROPERTIES = Array.from(PRESERVED_STYLE_PROPERTIES, (property) => {
  // @ts-expect-error -- https://github.com/microsoft/TypeScript/issues/61321
  return RegExp.escape(property);
});

const PRESERVED_STYLE_PROPERTY_REGEX = new RegExp(
  String.raw`(?:^|;)\s*(?:${ESCAPED_PRESERVED_STYLE_PROPERTIES.join('|')})\s*:`,
  'i',
);

/**
 * Strips the style attribute from an element, preserving only
 * color and background-color.
 */
function stripStyleAttribute($: cheerio.CheerioAPI, el: Element): void {
  if (!Object.hasOwn(el.attribs, 'style')) {
    return;
  }

  const styleAttribute = el.attribs.style;
  if (!styleAttribute) {
    delete el.attribs.style;
    return;
  }

  // Fast path: skip style parsing entirely when we know no preserved
  // property name can be present.
  if (!PRESERVED_STYLE_PROPERTY_REGEX.test(styleAttribute)) {
    delete el.attribs.style;
    return;
  }

  const parsedStyle = $(el).prop('style');
  if (!parsedStyle || typeof parsedStyle !== 'object' || typeof parsedStyle.length !== 'number') {
    delete el.attribs.style;
    return;
  }

  const preservedDeclarations = new Map<string, string>();

  const propertyNames = Array.from({ length: parsedStyle.length }, (_, i) => parsedStyle[i]);
  for (const rawPropertyName of propertyNames) {
    if (typeof rawPropertyName !== 'string') continue;

    const propertyName = rawPropertyName.trim().toLowerCase();
    if (!PRESERVED_STYLE_PROPERTIES.has(propertyName)) continue;

    const rawPropertyValue = parsedStyle[rawPropertyName];
    if (typeof rawPropertyValue !== 'string') continue;

    const propertyValue = rawPropertyValue.trim();
    if (!propertyValue) continue;

    preservedDeclarations.set(propertyName, propertyValue);
  }

  if (preservedDeclarations.size === 0) {
    delete el.attribs.style;
    return;
  }

  // `prop('style')` gives us a parsed style object, but no companion serializer.
  // Manual serialization is safe here because the property names come from a
  // fixed allowlist and values come from Cheerio's parser.
  el.attribs.style = Array.from(preservedDeclarations.entries())
    .map(([propertyName, propertyValue]) => `${propertyName}: ${propertyValue}`)
    .join('; ');
}

function stripBootstrapAttributes(el: Element): void {
  for (const name of Object.keys(el.attribs)) {
    if (name.startsWith('data-bs-')) {
      delete el.attribs[name];
    }
  }
}

/**
 * Processes rendered question HTML to make it suitable for AI grading.
 * This includes removing scripts/stylesheets and attributes that aren't
 * relevant to grading.
 */
export async function stripHtmlForAiGrading(html: string) {
  const $ = cheerio.load(html, null, false);

  // Remove elements that are guaranteed to be irrelevant to grading.
  $('script').remove();
  $('style').remove();
  $('link').remove();
  $('noscript').remove();
  $('svg').remove();

  // Filter out more irrelevant elements/attributes.
  $('*').each((_, el) => {
    if (el.type !== ElementType.Tag) return;

    // Remove elements that are hidden from screen readers.
    if (el.attribs['aria-hidden'] === 'true') {
      $(el).remove();
      return;
    }

    delete el.attribs.id;
    delete el.attribs.class;
    stripStyleAttribute($, el);
    stripBootstrapAttributes(el);
  });

  // Remove all elements that have no text content.
  $('*').each((_, el) => {
    if (el.type !== ElementType.Tag) return;
    if ($(el).text().trim() === '') {
      $(el).remove();
    }
  });

  const result = $.html();
  if (result.length > 10000) {
    // Prevent denial of service attacks by skipping Prettier formatting
    // if the HTML is too large. 10,000 characters was chosen arbitrarily.
    return html.trim();
  }

  return (await formatHtmlWithPrettier(result)).trim();
}
