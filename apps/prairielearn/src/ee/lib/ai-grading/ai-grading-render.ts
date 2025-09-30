import * as cheerio from 'cheerio';
import { ElementType } from 'domelementtype';

import { formatHtmlWithPrettier } from '../../../lib/prettier.js';

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
    $(el).removeAttr('style');
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
