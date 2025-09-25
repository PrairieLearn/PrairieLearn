import { renderHtml } from '@prairielearn/preact';

import { type AssessmentInstanceUrlParts, getAssessmentInstanceUrl } from '../lib/client/url.js';

export function AssessmentBadge({
  assessment,
  hideLink = false,
  urlPrefix,
  plainUrlPrefix,
  courseInstanceId,
  publicURL = false,
}: {
  assessment: { assessment_id: string; color: string; label: string };
  hideLink?: boolean;
  publicURL?: boolean;
} & AssessmentInstanceUrlParts) {
  if (hideLink) {
    return <span class={`badge color-${assessment.color}`}>{assessment.label}</span>;
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
          plainUrlPrefix,
          courseInstanceId,
          assessmentId: assessment.assessment_id,
          publicURL,
        },
  );

  return (
    <a href={link} class={`btn btn-badge color-${assessment.color}`}>
      {assessment.label}
    </a>
  );
}

export function AssessmentBadgeHtml({
  assessment,
  hideLink = false,
  urlPrefix,
  plainUrlPrefix,
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
        plainUrlPrefix={plainUrlPrefix}
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
  plainUrlPrefix,
  courseInstanceId,
  publicURL = false,
}: {
  assessments: { assessment_id: string; color: string; label: string }[];
  hideLink?: boolean;
  publicURL?: boolean;
} & (
  | {
      urlPrefix: string;
      plainUrlPrefix?: undefined;
      courseInstanceId?: undefined;
    }
  | { urlPrefix?: undefined; plainUrlPrefix: string; courseInstanceId: string }
)) {
  return assessments.map((assessment) => (
    <div key={assessment.assessment_id} class="d-inline-block me-1">
      {urlPrefix === undefined ? (
        <AssessmentBadge
          assessment={assessment}
          hideLink={hideLink}
          plainUrlPrefix={plainUrlPrefix}
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
