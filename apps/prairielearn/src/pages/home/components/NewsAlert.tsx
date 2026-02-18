import type { NewsItem } from '../../../lib/db-types.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export interface NewsAlertProps {
  newsItems: NewsItem[];
  csrfToken: string;
  blogUrl: string | null;
}

export function NewsAlert({ newsItems, csrfToken, blogUrl }: NewsAlertProps) {
  if (newsItems.length === 0) return null;

  return (
    <div
      className="card mb-4"
      style={{ borderLeft: '3px solid var(--bs-primary)' }}
      data-testid="news-alert"
    >
      <div className="card-body">
        <div className="d-flex align-items-center mb-3">
          <h5 className="mb-0">
            <i className="bi bi-newspaper me-2" aria-hidden="true" />
            News
          </h5>
          <form method="POST" className="ms-auto">
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="__action" value="dismiss_news_alert" />
            <button type="submit" className="btn-close" aria-label="Dismiss news alert" />
          </form>
        </div>
        {newsItems.map((item, index) => (
          <div key={item.guid}>
            {index > 0 && <hr className="my-2" />}
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="d-flex align-items-start py-1 text-decoration-none"
            >
              <i className="bi bi-arrow-up-right me-2 mt-1 text-muted small" aria-hidden="true" />
              <div>
                <span className="fw-semibold text-body">{item.title}</span>
                <div className="text-muted small">{dateFormatter.format(item.pub_date)}</div>
              </div>
            </a>
          </div>
        ))}
        {blogUrl && (
          <>
            <hr className="my-2" />
            <a
              href={blogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-decoration-none small"
            >
              View all posts <i className="bi bi-arrow-right" aria-hidden="true" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
