import clsx from 'clsx';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { renderHtml } from '@prairielearn/react';

import { type AssessmentUrlParts, getAssessmentUrl } from '../lib/client/url.js';

export function AssessmentBadge({
  assessment,
  hideLink = false,
  urlPrefix,
  courseInstanceId,
  publicURL = false,
  prefix,
  className,
  ref,
  ...anchorProps
}: {
  assessment: { assessment_id: string; color: string; label: string };
  hideLink?: boolean;
  publicURL?: boolean;
  prefix?: ReactNode;
} & AssessmentUrlParts &
  Omit<ComponentPropsWithRef<'a'>, 'children' | 'href' | 'prefix'>) {
  if (hideLink) {
    return (
      <span className={clsx(`badge color-${assessment.color}`, className)}>
        {prefix}
        {assessment.label}
      </span>
    );
  }

  const link = getAssessmentUrl(
    // TypeScript is not smart enough to infer the correct type here
    urlPrefix !== undefined
      ? {
          urlPrefix,
          assessmentId: assessment.assessment_id,
          publicURL,
        }
      : {
          courseInstanceId,
          assessmentId: assessment.assessment_id,
          publicURL,
        },
  );

  return (
    <a
      {...anchorProps}
      ref={ref}
      href={link}
      className={clsx(`btn btn-badge color-${assessment.color}`, className)}
    >
      {prefix}
      {assessment.label}
    </a>
  );
}

export function AssessmentBadgeHtml({
  assessment,
  hideLink = false,
  urlPrefix,
  courseInstanceId,
  publicURL = false,
}: {
  assessment: { assessment_id: string; color: string; label: string };
  hideLink?: boolean;
  publicURL?: boolean;
} & AssessmentUrlParts) {
  if (urlPrefix === undefined) {
    return renderHtml(
      <AssessmentBadge
        assessment={assessment}
        hideLink={hideLink}
        courseInstanceId={courseInstanceId}
        publicURL={publicURL}
      />,
    );
  }
  return renderHtml(
    <AssessmentBadge
      assessment={assessment}
      hideLink={hideLink}
      urlPrefix={urlPrefix}
      publicURL={publicURL}
    />,
  );
}
