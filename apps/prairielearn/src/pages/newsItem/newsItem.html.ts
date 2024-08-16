import { formatDateYMD } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import type { NewsItem } from '../../lib/db-types.js';

export function NewsItem({
  resLocals,
  newsItem,
  newsItemHtml,
  userIsInstructor,
}: {
  resLocals: Record<string, any>;
  newsItem: NewsItem;
  newsItemHtml: string;
  userIsInstructor: boolean;
}) {
  const { urlPrefix } = resLocals as { urlPrefix: string };
  const formattedDate = formatDateYMD(newsItem.date, 'UTC');
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageNote: formattedDate, pageTitle: newsItem.title })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'news_item' })}
        <main id="content" class="container">
          <article>
            <header>
              <a class="btn btn-primary mb-4" href="${urlPrefix}/news_items">
                <i class="fa fa-arrow-left" aria-hidden="true"></i>
                Back to news list
              </a>

              <h1>${newsItem.title}</h1>

              <p>
                <i class="mr-2 text-muted">
                  Posted on ${formattedDate}
                  ${newsItem.author ? html`by ${unsafeHtml(newsItem.author)}` : ''}
                </i>
                ${userIsInstructor && newsItem.visible_to_students
                  ? html`<span class="badge badge-secondary">Visible to students</span>`
                  : ''}
              </p>
            </header>

            ${unsafeHtml(newsItemHtml)}
          </article>

          <aside>
            <p class="text-right small border-top mt-5 pt-3">
              Want to help make PrairieLearn better? It's open source and contributions are welcome
              <a href="https://github.com/PrairieLearn/PrairieLearn" target="_blank">on GitHub</a>!
            </p>
          </aside>
        </main>
      </body>
    </html>
  `.toString();
}
