import type { CachedBlogPost } from '../../../lib/db-types.js';

export interface BlogPostAlertProps {
  posts: CachedBlogPost[];
  csrfToken: string;
}

export function BlogPostAlert({ posts, csrfToken }: BlogPostAlertProps) {
  if (posts.length === 0) return null;

  return (
    <div className="alert alert-info alert-dismissible mb-4" role="alert">
      <div className="d-flex align-items-start">
        <div className="flex-grow-1">
          <h5 className="alert-heading mb-2">
            <i className="bi bi-newspaper me-2" aria-hidden="true" />
            New from the PrairieLearn blog
          </h5>
          <ul className="mb-0 ps-3">
            {posts.map((post) => (
              <li key={post.guid}>
                <a href={post.link} target="_blank" rel="noopener noreferrer">
                  {post.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <form method="POST" className="ms-3">
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="__action" value="dismiss_blog_alert" />
          <button type="submit" className="btn-close" aria-label="Dismiss blog alert" />
        </form>
      </div>
    </div>
  );
}
