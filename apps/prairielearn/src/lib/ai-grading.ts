import * as cheerio from 'cheerio';

export function stripHtmlForAiGrading(html: string) {
  const $ = cheerio.load(html, null, false);
  $('script').remove();
  return $.html();
}
