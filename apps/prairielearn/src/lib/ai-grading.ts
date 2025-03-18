import * as cheerio from 'cheerio';

/**
 * Processes rendered question HTML to make it suitable for AI grading.
 * This includes removing scripts/stylesheets and attributes that aren't
 * relevant to grading.
 */
export function stripHtmlForAiGrading(html: string) {
  const $ = cheerio.load(html, null, false);

  // Remove elements that are guaranteed to be irrelevant to grading.
  $('script').remove();
  $('style').remove();
  $('link').remove();
  $('noscript').remove();
  $('svg').remove();

  // Filter out more irrelevant elements/attributes.
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;

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
    if (el.type !== 'tag') return;
    if ($(el).text().trim() === '') {
      $(el).remove();
    }
  });

  return $.html().trim();
}
