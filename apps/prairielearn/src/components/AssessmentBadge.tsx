import type { ReactNode } from 'react';

import { renderHtml } from '@prairielearn/react';

import { type AssessmentUrlParts, getAssessmentUrl } from '../lib/client/url.js';

type AssessmentBadgeProps = {
  assessment: { assessment_id: string; color: string; label: string };
  prefix?: ReactNode;
  publicURL?: boolean;
} & (
  | { hideLink: true; courseInstanceId?: string; urlPrefix?: string }
  | ({ hideLink?: false } & AssessmentUrlParts)
);

export function AssessmentBadge(props: AssessmentBadgeProps) {
  const { assessment, prefix } = props;

  if (props.hideLink) {
    return (
      <span className={`badge color-${assessment.color}`}>
        {prefix}
        {assessment.label}
      </span>
    );
  }

  const link = getAssessmentUrl(
    props.urlPrefix !== undefined
      ? {
          urlPrefix: props.urlPrefix,
          assessmentId: assessment.assessment_id,
          publicURL: props.publicURL,
        }
      : {
          courseInstanceId: props.courseInstanceId,
          assessmentId: assessment.assessment_id,
          publicURL: props.publicURL,
        },
  );

  return (
    <a href={link} className={`btn btn-badge color-${assessment.color}`}>
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
