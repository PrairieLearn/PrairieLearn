import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { NewsItemSchema } from '../../lib/db-types.js';

export const NewsItemRowSchema = NewsItemSchema.extend({
  formatted_date: z.string(),
  show_student_badge: z.boolean(),
  unread: z.boolean(),
});
type NewsItemRow = z.infer<typeof NewsItemRowSchema>;

export function NewsItems({
  resLocals,
  newsItems,
}: {
  resLocals: Record<string, any>;
  newsItems: NewsItemRow[];
}) {
  const { urlPrefix, news_item_notification_count: newsItemNotificationCount } = resLocals as {
    urlPrefix: string;
    news_item_notification_count?: number | null;
  };
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head') %>", {
          ...resLocals,
          pageTitle: 'News',
          pageNote:
            newsItemNotificationCount ?? 0 > 0 ? `${newsItemNotificationCount} Unread` : undefined,
        })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'news_items',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">News</div>

            ${newsItems.length === 0
              ? html`
                  <div class="card-body">
                    <div class="text-center text-muted">No news items</div>
                  </div>
                `
              : html`
                  <div class="table-responsive">
                    <table class="table table-hover table-striped news-items-table">
                      <tbody>
                        ${newsItems.map(
                          (newsItem) => html`
                            <tr>
                              <td class="align-middle" style="width: 1%; white-space: nowrap;">
                                ${newsItem.formatted_date}
                              </td>
                              <td class="align-middle">
                                <a href="${urlPrefix}/news_item/${newsItem.id}/">
                                  ${newsItem.title}
                                  ${newsItem.unread
                                    ? html`<span class="badge badge-primary ml-2">Unread</span>`
                                    : ''}
                                  ${newsItem.show_student_badge
                                    ? html`<span class="badge badge-secondary ml-2">
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
        </main>
      </body>
    </html>
  `.toString();
}
