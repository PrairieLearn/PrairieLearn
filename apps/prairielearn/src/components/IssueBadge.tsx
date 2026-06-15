import clsx from 'clsx';
import React from 'react';

import { renderHtml } from '@prairielearn/react';

import { getCourseIssuesUrl } from '../lib/client/url.js';

type IssueBadgeProps = {
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
      courseInstanceId?: undefined;
      issueQid?: string | null;
      issueAid?: string | null;
    }
  | {
      suppressLink?: false;
      courseId?: string | undefined;
      courseInstanceId: string;
      issueQid?: string | null;
      issueAid?: string | null;
    }
);

export function IssueBadge({
  count,
  suppressLink,
  issueQid,
  issueAid,
  courseId,
  courseInstanceId,
  className,
  onClick,
}: IssueBadgeProps & {
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  // Convert explicitly to a number because some unvalidated queries still return a string (via bigint)
  if (Number(count) === 0) return '';

  if (suppressLink) {
    return (
      <span className={clsx('badge', 'rounded-pill', 'text-bg-danger', className)}>{count}</span>
    );
  }

  const href =
    courseInstanceId !== undefined
      ? getCourseIssuesUrl({ courseInstanceId, qid: issueQid, assessment: issueAid })
      : getCourseIssuesUrl({ courseId, qid: issueQid, assessment: issueAid });

  return (
    <a
      className={clsx('badge', 'rounded-pill', 'text-bg-danger', className)}
      href={href}
      aria-label={`${count} open ${count === 1 ? 'issue' : 'issues'}`}
      onClick={onClick}
    >
      {count}
    </a>
  );
}

export function IssueBadgeHtml(props: IssueBadgeProps) {
  return renderHtml(<IssueBadge {...props} />);
}
