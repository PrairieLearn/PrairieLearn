import { formatDistanceStrict } from 'date-fns';

import type { NewsItem } from '../../../lib/db-types.js';

const absoluteDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const CATEGORY_CLASSES: Record<string, string> = {
  Release: 'bg-success-subtle text-success-emphasis border-success-subtle',
  Technical: 'bg-info-subtle text-info-emphasis border-info-subtle',
  Development: 'bg-warning-subtle text-warning-emphasis border-warning-subtle',
};

function NewsAlertItem({ item, now }: { item: NewsItem; now: Date }) {
  return (
    <div className="card news-alert-item bg-white">
      <a href={item.link} target="_blank" rel="noopener noreferrer" className="news-alert-link">
        <div className="news-alert-content">
          <div className="news-alert-header">
            <span className="news-alert-dot bg-primary rounded-circle" aria-label="New" />
            <span className="news-alert-title">{item.title}</span>
          </div>
          <div className="news-alert-meta">
            <div className="d-flex gap-1 flex-wrap">
              {item.categories.map((category) => (
                <span
                  key={category}
                  className={`badge rounded-pill fw-normal border ${CATEGORY_CLASSES[category] ?? 'text-bg-light'}`}
                >
                  {category}
                </span>
              ))}
            </div>
            <span
              className="text-muted small lh-1"
              title={absoluteDateFormatter.format(item.pub_date)}
            >
              {formatDistanceStrict(item.pub_date, now, { addSuffix: true })}
            </span>
          </div>
        </div>
        <i className="bi bi-arrow-up-right text-muted news-alert-arrow" aria-hidden="true" />
      </a>
    </div>
  );
}

export function NewsAlert({
  newsItems,
  csrfToken,
  blogUrl,
  now,
}: {
  newsItems: NewsItem[];
  csrfToken: string;
  blogUrl: string | null;
  now: Date;
}) {
  if (newsItems.length === 0) return null;

  return (
    <div className="card mb-4" data-testid="news-alert">
      <style>{`
        .news-alert-item:hover {
          background-color: var(--bs-tertiary-bg) !important;
        }
        .news-alert-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          text-decoration: none;
          color: inherit;
        }
        .news-alert-content {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1 1 auto;
          min-width: 0;
        }
        .news-alert-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }
        .news-alert-dot {
          width: 8px;
          height: 8px;
          flex-shrink: 0;
        }
        .news-alert-title {
          font-weight: 600;
          overflow-wrap: anywhere;
          min-width: 0;
        }
        .news-alert-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .news-alert-arrow {
          flex-shrink: 0;
        }
        @media (min-width: 768px) {
          .news-alert-content {
            flex-direction: row;
            align-items: center;
            gap: 0.75rem;
          }
          .news-alert-header {
            flex: 1 1 auto;
          }
          .news-alert-meta {
            flex-shrink: 0;
            flex-wrap: nowrap;
          }
        }
      `}</style>
      <div className="card-body">
        <div className="d-flex align-items-center mb-3">
          <h2
            className="fw-semibold d-flex align-items-center lh-1 mb-0"
            style={{ fontSize: '1.125rem' }}
          >
            <i className="bi bi-newspaper me-2" aria-hidden="true" />
            News
          </h2>
          <form method="POST" className="ms-auto m-0">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="dismiss_news_alert" />
            <button
              type="submit"
              className="btn btn-sm btn-link text-body-secondary text-decoration-none p-0"
            >
              Dismiss all
            </button>
          </form>
        </div>
        <div className="d-flex flex-column gap-2">
          {newsItems.map((item) => (
            <NewsAlertItem key={item.guid} item={item} now={now} />
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
