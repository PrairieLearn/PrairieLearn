import type { NewsItem } from '../../../lib/db-types.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
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

  return (
    <div
      className="card mb-4 news-alert"
      style={{ borderLeft: '3px solid var(--bs-primary)' }}
      data-testid="news-alert"
    >
      <style>{`
        .news-alert .news-alert-item {
          transition: background-color 0.15s ease;
        }
        .news-alert .news-alert-item:hover {
          background-color: var(--bs-tertiary-bg);
        }
        .news-alert .news-alert-arrow {
          transition: transform 0.15s ease;
        }
        .news-alert .news-alert-item:hover .news-alert-arrow {
          transform: translate(2px, -2px);
        }
      `}</style>
      <div className="card-body pb-2 d-flex align-items-center">
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
      <div className="list-group list-group-flush">
        {newsItems.map((item) => (
          <a
            key={item.guid}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="list-group-item news-alert-item d-flex align-items-center gap-3 text-decoration-none text-body"
          >
            <span
              className="bg-primary rounded-circle flex-shrink-0"
              style={{ width: 8, height: 8 }}
              aria-label="New"
            />
            <span
              className="fw-semibold flex-grow-1 text-truncate"
              style={{ fontSize: '1.0625rem' }}
            >
              {item.title}
            </span>
            <span className="text-muted small flex-shrink-0">
              {dateFormatter.format(item.pub_date)}
            </span>
            <i
              className="bi bi-arrow-up-right news-alert-arrow text-muted flex-shrink-0"
              aria-hidden="true"
            />
          </a>
        ))}
      </div>
      {blogUrl && (
        <div className="card-body pt-2">
          <a
            href={blogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-decoration-none small"
          >
            View all posts <i className="bi bi-arrow-right" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
