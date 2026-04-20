import { formatDistanceStrict } from 'date-fns';

import type { NewsItem } from '../../../lib/db-types.js';

const absoluteDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

interface NewsAlertProps {
  newsItems: NewsItem[];
  csrfToken: string;
  blogUrl: string | null;
}

export function NewsAlert({ newsItems, csrfToken, blogUrl }: NewsAlertProps) {
  if (newsItems.length === 0) return null;

  const now = new Date();

  return (
    <div className="card mb-4 news-alert bg-body" data-testid="news-alert">
      <style>{`
        .news-alert .news-alert-item {
          flex: 1 1 0;
          min-width: 0;
          background-color: #fff;
          border: 1px solid var(--bs-border-color-translucent);
          transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
        }
        .news-alert .news-alert-item:hover {
          border-color: var(--bs-primary);
          box-shadow: 0 4px 12px rgba(var(--bs-primary-rgb), 0.08);
          transform: translateY(-1px);
        }
        .news-alert .news-alert-arrow {
          transition: transform 0.15s ease;
        }
        .news-alert .news-alert-item:hover .news-alert-arrow {
          transform: translate(2px, -2px);
          color: var(--bs-primary) !important;
        }
      `}</style>
      <div className="card-body">
        <div className="d-flex align-items-center mb-3">
          <span
            className="fw-semibold d-flex align-items-center lh-1"
            style={{ fontSize: '1.125rem' }}
          >
            <i className="bi bi-newspaper me-2" aria-hidden="true" />
            News
          </span>
          <form method="POST" className="ms-auto m-0 d-flex">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="dismiss_news_alert" />
            <button type="submit" className="btn-close" aria-label="Dismiss news alert" />
          </form>
        </div>
        <div className="d-flex gap-3">
          {newsItems.map((item) => (
            <a
              key={item.guid}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="card news-alert-item text-decoration-none text-body"
            >
              <div className="card-body p-3">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span
                    className="bg-primary rounded-circle flex-shrink-0"
                    style={{ width: 8, height: 8 }}
                    aria-label="New"
                  />
                  <span className="fw-semibold flex-grow-1 text-truncate">{item.title}</span>
                  <i
                    className="bi bi-arrow-up-right news-alert-arrow text-muted flex-shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <div
                  className="text-muted small"
                  title={absoluteDateFormatter.format(item.pub_date)}
                >
                  {formatDistanceStrict(item.pub_date, now, { addSuffix: true })}
                </div>
              </div>
            </a>
          ))}
        </div>
        {blogUrl && (
          <a
            href={blogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-decoration-none small mt-3 d-inline-block"
          >
            View all posts <i className="bi bi-arrow-right" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
