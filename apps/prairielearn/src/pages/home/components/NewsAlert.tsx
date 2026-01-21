import type { CachedNewsItem } from '../../../lib/db-types.js';

export interface NewsAlertProps {
  newsItems: CachedNewsItem[];
  csrfToken: string;
}

export function NewsAlert({ newsItems, csrfToken }: NewsAlertProps) {
  if (newsItems.length === 0) return null;

  return (
    <div className="alert alert-info alert-dismissible mb-4" role="alert">
      <div className="d-flex align-items-start">
        <div className="flex-grow-1">
          <h5 className="alert-heading mb-2">
            <i className="bi bi-newspaper me-2" aria-hidden="true" />
            News
          </h5>
          <ul className="mb-0 ps-3">
            {newsItems.map((item) => (
              <li key={item.guid}>
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <form method="POST" className="ms-3">
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="__action" value="dismiss_news_alert" />
          <button type="submit" className="btn-close" aria-label="Dismiss news alert" />
        </form>
      </div>
    </div>
  );
}
