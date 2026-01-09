import { renderHtml } from '@prairielearn/preact';

import { type AssessmentInstanceUrlParts, getAssessmentInstanceUrl } from '../lib/client/url.js';

export function AssessmentBadge({
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
  if (hideLink) {
    return <span className={`badge color-${assessment.color}`}>{assessment.label}</span>;
  }

  const link = getAssessmentInstanceUrl(
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

export function AssessmentBadgeList({
  assessments,
  hideLink = false,
  urlPrefix,
  courseInstanceId,
  publicURL = false,
}: {
  assessments: { assessment_id: string; color: string; label: string }[];
  hideLink?: boolean;
  publicURL?: boolean;
} & (
  | {
      urlPrefix: string;
      courseInstanceId?: undefined;
    }
  | { urlPrefix?: undefined; courseInstanceId: string }
)) {
  return assessments.map((assessment) => (
    <div key={assessment.assessment_id} className="d-inline-block me-1">
      {urlPrefix === undefined ? (
        <AssessmentBadge
          assessment={assessment}
          hideLink={hideLink}
          courseInstanceId={courseInstanceId}
          publicURL={publicURL}
        />
      ) : (
        <AssessmentBadge
          assessment={assessment}
          hideLink={hideLink}
          urlPrefix={urlPrefix}
          publicURL={publicURL}
        />
      )}
    </div>
  ));
}
