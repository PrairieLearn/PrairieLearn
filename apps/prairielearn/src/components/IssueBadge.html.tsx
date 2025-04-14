import { clsx } from 'clsx';

import { renderHtml } from '../lib/preact-html.js';

export function IssueBadgePreact({
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
    return <span class={clsx('badge rounded-pill text-bg-danger', className)}>{count}</span>;
  }

  let query = 'is%3Aopen';
  if (issueQid) {
    query += `+qid%3A${encodeURIComponent(issueQid)}`;
  }
  if (issueAid) {
    query += `+assessment%3A${encodeURIComponent(issueAid)}`;
  }

  return (
    <a
      class={clsx('badge rounded-pill text-bg-danger', className)}
      href={`${urlPrefix}/course_admin/issues?q=${query}`}
      aria-label={`${count} open ${count === 1 ? 'issue' : 'issues'}`}
    >
      {count}
    </a>
  );
}

export function IssueBadge(props: Parameters<typeof IssueBadgePreact>[0]) {
  return renderHtml(<IssueBadgePreact {...props} />);
}
