import clsx from 'clsx';

import { renderHtml } from '@prairielearn/react';

import { getCourseIssuesUrl } from '../lib/client/url.js';

export function IssueBadge({
  count,
  suppressLink,
  issueQid,
  issueAid,
  courseId,
  courseInstanceId,
  className,
}: {
  count: number;
  className?: string;
} & (
  | {
      suppressLink: true;
      courseId?: undefined;
      courseInstanceId?: undefined;
      issueQid?: undefined;
      issueAid?: undefined;
    }
  | {
      suppressLink?: false;
      courseId: string;
      courseInstanceId?: string;
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

  return (
    <a
      className={clsx('badge', 'rounded-pill', 'text-bg-danger', className)}
      href={getCourseIssuesUrl({ courseId, courseInstanceId, qid: issueQid, assessment: issueAid })}
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
  courseId,
  courseInstanceId,
  className,
}: {
  count: number;
  className?: string;
} & (
  | {
      suppressLink: true;
      courseId?: undefined;
      courseInstanceId?: undefined;
      issueQid?: undefined;
      issueAid?: undefined;
    }
  | {
      suppressLink?: false;
      courseId: string;
      courseInstanceId?: string;
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
      courseId={courseId}
      courseInstanceId={courseInstanceId}
      issueQid={issueQid}
      issueAid={issueAid}
    />,
  );
}
