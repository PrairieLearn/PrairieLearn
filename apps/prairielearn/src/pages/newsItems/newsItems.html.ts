import { z } from 'zod';

import { formatDateYMD } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { NewsItemSchema } from '../../lib/db-types.js';

export const NewsItemRowSchema = NewsItemSchema.extend({
  unread: z.boolean(),
});
type NewsItemRow = z.infer<typeof NewsItemRowSchema>;

export function NewsItems({
  resLocals,
  newsItems,
  userIsInstructor,
}: {
  resLocals: Record<string, any>;
  newsItems: NewsItemRow[];
  userIsInstructor: boolean;
}) {
  const { urlPrefix, news_item_notification_count: newsItemNotificationCount } = resLocals as {
    urlPrefix: string;
    news_item_notification_count?: number | null;
  };

  return PageLayout({
    resLocals,
    pageTitle: 'News',
    navContext: {
      // A value wasn't hardcoded because the type depends on the route that serves the page
      type: resLocals.navbarType,
      page: 'news_items',
    },
    options: {
      pageNote:
        (newsItemNotificationCount ?? 0) > 0 ? `${newsItemNotificationCount} Unread` : undefined,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h1>News</h1>
        </div>

        ${newsItems.length === 0
          ? html`
              <div class="card-body">
                <div class="text-center text-muted">No news items</div>
              </div>
            `
          : html`
              <div class="table-responsive">
                <table
                  class="table table-hover table-striped news-items-table"
                  aria-label="News items"
                >
                  <tbody>
                    ${newsItems.map(
                      (newsItem) => html`
                        <tr>
                          <td class="align-middle" style="width: 1%; white-space: nowrap;">
                            ${formatDateYMD(newsItem.date, 'UTC')}
                          </td>
                          <td class="align-middle">
                            <a href="${urlPrefix}/news_item/${newsItem.id}/">
                              ${newsItem.title}
                              ${newsItem.unread
                                ? html`<span class="badge text-bg-primary ms-2">Unread</span>`
                                : ''}
                              ${newsItem.visible_to_students && userIsInstructor
                                ? html`<span class="badge text-bg-secondary ms-2">
                                    Visible to students
                                  </span>`
                                : ''}
                            </a>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `}
      </div>
    `,
  });
}
