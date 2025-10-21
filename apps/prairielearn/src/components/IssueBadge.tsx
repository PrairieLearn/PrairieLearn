import clsx from 'clsx';

import { renderHtml } from '@prairielearn/preact';

export function IssueBadge({
  count,
  suppressLink,
  issueQid,
  issueAid,
  urlPrefix,
  class: className,
}: {
  count: number;
  class?: string;
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
    return <span class={clsx('badge', 'rounded-pill', 'text-bg-danger', className)}>{count}</span>;
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
      class={clsx('badge', 'rounded-pill', 'text-bg-danger', className)}
      href={`${urlPrefix}/course_admin/issues?q=${query}`}
      aria-label={`${count} open ${count === 1 ? 'issue' : 'issues'}`}
    >
      {count}
    </a>
  );
}

export function IssueBadgeHtml({
  count,
  suppressLink,
  issueQid,
  issueAid,
  urlPrefix,
  class: className,
}: {
  count: number;
  class?: string;
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
  if (suppressLink) {
    return renderHtml(<IssueBadge count={count} class={className} suppressLink={suppressLink} />);
  }

  return renderHtml(
    <IssueBadge
      count={count}
      class={className}
      urlPrefix={urlPrefix}
      issueQid={issueQid}
      issueAid={issueAid}
    />,
  );
}
