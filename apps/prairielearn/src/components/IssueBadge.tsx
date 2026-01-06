import clsx from 'clsx';

import { renderHtml } from '@prairielearn/preact';

import { encodeSearchString } from '../lib/uri-util.shared.js';

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
    return (
      <span className={clsx('badge', 'rounded-pill', 'text-bg-danger', className)}>{count}</span>
    );
  }

  const query = encodeSearchString({ is: 'open', qid: issueQid, assessment: issueAid });

  return (
    <a
      className={clsx('badge', 'rounded-pill', 'text-bg-danger', className)}
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
  if (suppressLink) {
    return renderHtml(
      <IssueBadge count={count} className={className} suppressLink={suppressLink} />,
    );
  }

  return renderHtml(
    <IssueBadge
      count={count}
      className={className}
      urlPrefix={urlPrefix}
      issueQid={issueQid}
      issueAid={issueAid}
    />,
  );
}
