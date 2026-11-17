import { formatDistanceStrict } from 'date-fns';

import { formatDate } from '@prairielearn/formatter';

import type { NewsItem } from '../../../lib/db-types.js';

interface CategoryStyle {
  bg: string;
  text: string;
  border: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  Release: {
    bg: 'bg-success-subtle',
    text: 'text-success-emphasis',
    border: 'border-success-subtle',
  },
  Technical: {
    bg: 'bg-info-subtle',
    text: 'text-info-emphasis',
    border: 'border-info-subtle',
  },
  Development: {
    bg: 'bg-warning-subtle',
    text: 'text-warning-emphasis',
    border: 'border-warning-subtle',
  },
};

const FALLBACK_CATEGORY_STYLE: CategoryStyle = {
  bg: 'bg-secondary-subtle',
  text: 'text-secondary-emphasis',
  border: 'border-secondary-subtle',
};

function NewsAlertItem({ item, now }: { item: NewsItem; now: Date }) {
  return (
    <div className="card news-alert-item">
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="d-flex align-items-center gap-3 px-2 py-2 text-decoration-none text-body"
      >
        <div
          className="d-flex flex-column flex-md-row align-items-md-center gap-2 gap-md-3 flex-grow-1"
          style={{ minWidth: 0 }}
        >
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            <span className="fw-semibold" style={{ minWidth: 0 }}>
              {item.title}
            </span>
          </div>
          <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-2 flex-md-grow-1">
            <div className="d-flex gap-2 flex-wrap">
              {item.categories.map((category) => {
                const style = CATEGORY_STYLES[category] ?? FALLBACK_CATEGORY_STYLE;
                return (
                  <span
                    key={category}
                    className={`badge rounded-pill fw-normal border ${style.bg} ${style.text} ${style.border}`}
                  >
                    {category}
                  </span>
                );
              })}
            </div>
            <span
              className="text-muted small lh-1 ms-md-auto"
              title={formatDate(item.pub_date, 'UTC')}
            >
              {formatDistanceStrict(item.pub_date, now, { addSuffix: true })}
            </span>
          </div>
        </div>
        <i
          className="bi bi-arrow-up-right text-muted flex-shrink-0 d-none d-sm-inline"
          aria-hidden="true"
        />
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
    <div
      className="card mb-4"
      style={{ borderLeft: '4px solid var(--bs-primary)' }}
      data-testid="news-alert"
    >
      <style>{`
        .news-alert-item:hover {
          background-color: var(--bs-tertiary-bg);
        }
        .news-alert-dismiss {
          color: var(--bs-secondary-color);
          transition: color 0.15s ease, transform 0.15s ease;
        }
        .news-alert-dismiss:hover {
          color: var(--bs-body-color);
          transform: scale(1.05);
        }
      `}</style>
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <h2
            className="fw-semibold d-flex align-items-center lh-1 mb-0"
            style={{ fontSize: '1.125rem' }}
          >
            <i className="bi bi-newspaper text-primary me-2" aria-hidden="true" />
            News
          </h2>
          <div className="w-100 d-sm-none" />
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 flex-grow-1 ms-sm-3">
            {blogUrl && (
              <a
                href={blogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="small text-decoration-none"
              >
                View all posts <i className="bi bi-arrow-up-right" aria-hidden="true" />
              </a>
            )}
            <form method="POST" className="m-0">
              <input type="hidden" name="__csrf_token" value={csrfToken} />
              <input type="hidden" name="__action" value="dismiss_news_alert" />
              <button
                type="submit"
                className="btn btn-sm btn-link news-alert-dismiss text-decoration-none p-0"
              >
                Dismiss all
              </button>
            </form>
          </div>
        </div>
        <div className="d-flex flex-column gap-2">
          {newsItems.map((item) => (
            <NewsAlertItem key={item.guid} item={item} now={now} />
          ))}
        </div>
      </div>
    </div>
  );
}
