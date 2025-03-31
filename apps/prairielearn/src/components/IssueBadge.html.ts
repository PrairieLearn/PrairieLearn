import { html } from '@prairielearn/html';

export function IssueBadge({
  count,
  suppressLink,
  issueQid,
  issueAid,
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
      issueAid?: undefined;
    }
  | {
      suppressLink?: false;
      urlPrefix: string;
      issueQid?: string | null;
      issueAid?: string | null;
    }
)) {
  // Convert explicitly to a number because some unvalidated queries still return a string (via bigint)
  if (Number(count) === 0) return '';

  if (suppressLink) {
    return html`<span class="badge rounded-pill text-bg-danger ${className ?? ''}">${count}</span>`;
  }

  if (issueAid) {
    return html`
    <a
      class="badge rounded-pill text-bg-danger ${className ?? ''}"
      href="${urlPrefix}/course_admin/issues${issueAid
        ? `?q=is%3Aopen+assessment%3A${encodeURIComponent(issueAid)}`
        : ''}"
      aria-label="${count} open ${count === 1 ? 'issue' : 'issues'}"
    >
      ${count}
    </a>
  `;
  }

  return html`
    <a
      class="badge rounded-pill text-bg-danger ${className ?? ''}"
      href="${urlPrefix}/course_admin/issues${issueQid
        ? `?q=is%3Aopen+qid%3A${encodeURIComponent(issueQid)}`
        : ''}"
      aria-label="${count} open ${count === 1 ? 'issue' : 'issues'}"
    >
      ${count}
    </a>
  `;
}
