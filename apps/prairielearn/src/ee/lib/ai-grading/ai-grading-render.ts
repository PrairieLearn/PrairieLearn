import * as cheerio from 'cheerio';
import { ElementType } from 'domelementtype';
import type { AnyNode } from 'domhandler';

import { formatHtmlWithPrettier } from '../../../lib/prettier.js';

const PRESERVED_STYLE_PROPERTIES = new Set(['color', 'background-color']);

/**
 * Strips the style attribute from an element, preserving only
 * color and background-color.
 */
function stripStyleAttribute($: cheerio.CheerioAPI, el: AnyNode): void {
  const parsedStyle = $(el).prop('style');

  const preservedDeclarations = new Map<string, string>();
  if (parsedStyle && typeof parsedStyle === 'object' && typeof parsedStyle.length === 'number') {
    const propertyNames = Array.from({ length: parsedStyle.length }, (_, i) => parsedStyle[i]);
    for (const rawPropertyName of propertyNames) {
      if (typeof rawPropertyName !== 'string') continue;

      const propertyName = rawPropertyName.trim().toLowerCase();
      if (!PRESERVED_STYLE_PROPERTIES.has(propertyName)) continue;

      const rawPropertyValue =
        parsedStyle[rawPropertyName] ??
        // Prefer exact key match, but fall back to lowercase for safety.
        parsedStyle[propertyName];
      if (typeof rawPropertyValue !== 'string') continue;

      const propertyValue = rawPropertyValue.trim();
      if (!propertyValue) continue;

      preservedDeclarations.set(propertyName, propertyValue);
    }
  }

  if (preservedDeclarations.size > 0) {
    const style = Array.from(preservedDeclarations.entries())
      .map(([propertyName, propertyValue]) => `${propertyName}: ${propertyValue}`)
      .join('; ');
    $(el).attr('style', style);
  } else {
    $(el).removeAttr('style');
  }
}

function stripBootstrapAttributes($: cheerio.CheerioAPI, el: AnyNode): void {
  for (const name of Object.keys(el.attribs)) {
    if (name.startsWith('data-bs-')) {
      $(el).removeAttr(name);
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
    if ($(el).attr('aria-hidden') === 'true') {
      $(el).remove();
      return;
    }

    $(el).removeAttr('id');
    $(el).removeAttr('class');
    stripStyleAttribute($, el);
    stripBootstrapAttributes($, el);
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
