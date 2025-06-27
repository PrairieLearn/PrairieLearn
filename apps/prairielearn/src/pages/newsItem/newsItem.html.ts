import { formatDateYMD } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';
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

  return PageLayout({
    resLocals,
    pageTitle: newsItem.title,
    navContext: {
      type: resLocals.navbarType,
      page: 'news_item',
      subPage: 'news_item',
    },
    options: {
      pageNote: formattedDate,
    },
    content: html`
      <article>
        <header>
          <a class="btn btn-primary mb-4" href="${urlPrefix}/news_items">
            <i class="fa fa-arrow-left" aria-hidden="true"></i>
            Back to news list
          </a>

          <h1>${newsItem.title}</h1>

          <p>
            <i class="me-2 text-muted">
              Posted on ${formattedDate}
              ${newsItem.author ? html`by ${unsafeHtml(newsItem.author)}` : ''}
            </i>
            ${userIsInstructor && newsItem.visible_to_students
              ? html`<span class="badge text-bg-secondary">Visible to students</span>`
              : ''}
          </p>
        </header>

        ${unsafeHtml(newsItemHtml)}
      </article>

      <aside>
        <p class="text-end small border-top mt-5 pt-3">
          Want to help make PrairieLearn better? It's open source and contributions are welcome
          <a href="https://github.com/PrairieLearn/PrairieLearn" target="_blank">on GitHub</a>!
        </p>
      </aside>
    `,
  });
}
