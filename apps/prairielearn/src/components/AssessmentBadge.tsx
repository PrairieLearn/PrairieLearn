import { renderHtml } from '@prairielearn/react';

import { type AssessmentInstanceUrlParts, getAssessmentInstanceUrl } from '../lib/client/url.js';

type AssessmentBadgeProps = {
  assessment: { assessment_id: string; color: string; label: string };
} & (
  | ({ hideLink: true } & Partial<AssessmentInstanceUrlParts> & { publicURL?: boolean })
  | ({ hideLink?: false } & AssessmentInstanceUrlParts & { publicURL?: boolean })
);

export function AssessmentBadge(props: AssessmentBadgeProps) {
  const { assessment } = props;

  if (props.hideLink) {
    return <span className={`badge color-${assessment.color}`}>{assessment.label}</span>;
  }

  const link = getAssessmentInstanceUrl(
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
} & AssessmentInstanceUrlParts) {
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
