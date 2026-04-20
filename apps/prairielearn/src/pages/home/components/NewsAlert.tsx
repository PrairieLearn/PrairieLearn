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
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="card h-100 text-decoration-none text-body bg-white news-alert-item"
    >
      <div className="card-body p-3">
        <div className="d-flex align-items-center gap-2 mb-2">
          <span
            className="bg-primary rounded-circle flex-shrink-0"
            style={{ width: 8, height: 8 }}
            aria-label="New"
          />
          <span className="fw-semibold flex-grow-1 text-truncate">{item.title}</span>
          <i className="bi bi-arrow-up-right text-muted flex-shrink-0" aria-hidden="true" />
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="text-muted small" title={absoluteDateFormatter.format(item.pub_date)}>
            {formatDistanceStrict(item.pub_date, now, { addSuffix: true })}
          </span>
          {item.categories.map((category) => (
            <span
              key={category}
              className={`badge rounded-pill fw-normal border ${CATEGORY_CLASSES[category] ?? 'text-bg-light'}`}
            >
              {category}
            </span>
          ))}
        </div>
      </div>
    </a>
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
    <div className="card mb-4 bg-body" data-testid="news-alert">
      <style>{`
        .news-alert-item:hover {
          background-color: var(--bs-tertiary-bg) !important;
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
          <form method="POST" className="ms-auto m-0 d-flex">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="dismiss_news_alert" />
            <button type="submit" className="btn-close" aria-label="Dismiss news alert" />
          </form>
        </div>
        <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
          {newsItems.map((item) => (
            <div key={item.guid} className="col">
              <NewsAlertItem item={item} now={now} />
            </div>
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
