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
    <div className="card news-alert-item bg-white mb-2">
      <div className="card-body d-flex align-items-center gap-3 py-2 px-3">
        <span
          className="bg-primary rounded-circle flex-shrink-0"
          style={{ width: 8, height: 8 }}
          aria-label="New"
        />
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="d-flex align-items-center gap-3 flex-grow-1 text-decoration-none text-body"
          style={{ minWidth: 0 }}
        >
          <span className="fw-semibold text-truncate" style={{ minWidth: 0 }}>
            {item.title}
          </span>
          <div className="d-flex gap-1 flex-shrink-0">
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
            className="text-muted small ms-auto flex-shrink-0"
            title={absoluteDateFormatter.format(item.pub_date)}
          >
            {formatDistanceStrict(item.pub_date, now, { addSuffix: true })}
          </span>
          <i className="bi bi-arrow-up-right text-muted flex-shrink-0" aria-hidden="true" />
        </a>
        <button type="button" className="btn-close flex-shrink-0" aria-label="Dismiss news item" />
      </div>
    </div>
  );
}

export function NewsAlert({
  newsItems,
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
    <div className="mb-4" data-testid="news-alert">
      <style>{`
        .news-alert-item:hover {
          background-color: var(--bs-tertiary-bg) !important;
        }
      `}</style>
      {newsItems.map((item) => (
        <NewsAlertItem key={item.guid} item={item} now={now} />
      ))}
      {blogUrl && (
        <a
          href={blogUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none small mt-1 d-inline-block"
        >
          View all posts <i className="bi bi-arrow-right" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
