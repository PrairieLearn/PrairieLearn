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
        className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none text-body"
      >
        <div
          className="d-flex flex-column flex-md-row align-items-md-center gap-2 gap-md-3 flex-grow-1"
          style={{ minWidth: 0 }}
        >
          <div className="d-flex align-items-center gap-2 flex-md-grow-1" style={{ minWidth: 0 }}>
            <span
              className="bg-primary rounded-circle flex-shrink-0"
              style={{ width: 8, height: 8 }}
              aria-label="New"
            />
            <span className="fw-semibold" style={{ minWidth: 0 }}>
              {item.title}
            </span>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap flex-md-nowrap flex-md-shrink-0">
            <div className="d-flex gap-1 flex-wrap">
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
            <span className="text-muted small lh-1" title={formatDate(item.pub_date, 'UTC')}>
              {formatDistanceStrict(item.pub_date, now, { addSuffix: true })}
            </span>
          </div>
        </div>
        <i className="bi bi-arrow-up-right text-muted flex-shrink-0" aria-hidden="true" />
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
          background-color: var(--bs-tertiary-bg);
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
