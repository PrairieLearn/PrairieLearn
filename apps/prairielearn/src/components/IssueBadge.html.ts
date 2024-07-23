import { html } from '@prairielearn/html';

export function IssueBadge({
  count,
  suppressLink,
  issueQid,
  urlPrefix,
  className,
}: {
  count: number;
  className?: string;
} & (
  | {
      suppressLink: true;
      urlPrefix?: undefined;
      issueQid?: undefined;
    }
  | {
      suppressLink?: false;
      urlPrefix: string;
      issueQid?: string | null;
    }
)) {
  if (count === 0) return '';

  if (suppressLink) {
    return html`<span class="badge badge-pill badge-danger ${className ?? ''}">${count}</span>`;
  }

  return html`
    <a
      class="badge badge-pill badge-danger ${className ?? ''}"
      href="${urlPrefix}/course_admin/issues${issueQid
        ? `?q=is%3Aopen+qid%3A${encodeURIComponent(issueQid)}`
        : ''}"
    >
      ${count}
    </a>
  `;
}
