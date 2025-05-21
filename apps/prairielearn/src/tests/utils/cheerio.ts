import * as cheerio from 'cheerio';

export { type CheerioAPI } from 'cheerio';

// https://cheerio.js.org/docs/advanced/configuring-cheerio#using-htmlparser2-for-html
// https://github.com/fb55/htmlparser2?tab=readme-ov-file#performance
export const load = (html: string) => {
  return cheerio.load(html, {
    xml: {
      // Disable `xmlMode` to parse HTML with htmlparser2.
      xmlMode: false,
      recognizeSelfClosing: true,
    },
  });
};
