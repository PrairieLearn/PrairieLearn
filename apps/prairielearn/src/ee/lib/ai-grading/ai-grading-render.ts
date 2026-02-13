import * as cheerio from 'cheerio';
import { ElementType } from 'domelementtype';
import type { AnyNode } from 'domhandler';

import { formatHtmlWithPrettier } from '../../../lib/prettier.js';

interface StripHtmlForAiGradingOptions {
  preservedStyleProperties?: string[];
}

interface ParsedStyleDeclaration {
  [index: number]: unknown;
  [property: string]: unknown;
  length?: unknown;
}

function getPreservedStyle({
  $,
  el,
  preservedStyleProperties,
}: {
  $: cheerio.CheerioAPI;
  el: AnyNode;
  preservedStyleProperties: Set<string>;
}): string | null {
  const parsedStyle = $(el).prop('style') as ParsedStyleDeclaration | undefined;
  if (!parsedStyle || typeof parsedStyle !== 'object') return null;
  if (typeof parsedStyle.length !== 'number') return null;

  const preservedDeclarations = new Map<string, string>();
  const propertyNames = Array.from({ length: parsedStyle.length }, (_, i) => parsedStyle[i]);
  for (const rawPropertyName of propertyNames) {
    if (typeof rawPropertyName !== 'string') continue;

    const propertyName = rawPropertyName.trim().toLowerCase();
    if (!preservedStyleProperties.has(propertyName)) continue;

    const rawPropertyValue =
      parsedStyle[rawPropertyName] ??
      // Prefer exact key match, but fall back to lowercase for safety.
      parsedStyle[propertyName];
    if (typeof rawPropertyValue !== 'string') continue;

    const propertyValue = rawPropertyValue.trim();
    if (!propertyValue) continue;

    preservedDeclarations.set(propertyName, propertyValue);
  }

  if (preservedDeclarations.size === 0) return null;
  return Array.from(preservedDeclarations.entries())
    .map(([propertyName, propertyValue]) => `${propertyName}: ${propertyValue}`)
    .join('; ');
}

/**
 * Processes rendered question HTML to make it suitable for AI grading.
 * This includes removing scripts/stylesheets and attributes that aren't
 * relevant to grading.
 */
export async function stripHtmlForAiGrading(
  html: string,
  { preservedStyleProperties = [] }: StripHtmlForAiGradingOptions = {},
) {
  const $ = cheerio.load(html, null, false);
  const preservedStylePropertiesSet = new Set(
    preservedStyleProperties.map((property) => property.trim().toLowerCase()),
  );

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
    if (preservedStylePropertiesSet.size === 0) {
      $(el).removeAttr('style');
    } else {
      const preservedStyle = getPreservedStyle({
        $,
        el,
        preservedStyleProperties: preservedStylePropertiesSet,
      });
      if (preservedStyle) {
        $(el).attr('style', preservedStyle);
      } else {
        $(el).removeAttr('style');
      }
    }
    for (const name of Object.keys(el.attribs)) {
      if (name.startsWith('data-bs-')) {
        $(el).removeAttr(name);
      }
    }
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
