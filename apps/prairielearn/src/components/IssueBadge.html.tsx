import { clsx } from 'clsx';

import { renderHtml } from '../lib/preact-html.js';

export function IssueBadgePreact({
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
  // Convert explicitly to a number because some unvalidated queries still return a string (via bigint)
  if (Number(count) === 0) return '';

  if (suppressLink) {
    return <span class={clsx('badge badge-pill badge-danger', className)}>{count}</span>;
  }

  return (
    <a
      class={clsx('badge badge-pill badge-danger', className)}
      href={`${urlPrefix}/course_admin/issues${
        issueQid ? `?q=is%3Aopen+qid%3A${encodeURIComponent(issueQid)}` : ''
      }`}
      aria-label={`${count} open ${count === 1 ? 'issue' : 'issues'}`}
    >
      {count}
    </a>
  );
}

export function IssueBadge(props: Parameters<typeof IssueBadgePreact>[0]) {
  return renderHtml(<IssueBadgePreact {...props} />);
}
