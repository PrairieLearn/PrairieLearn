import { renderHtml } from '../lib/preact-html.js';

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
} & ( // If urlPrefix is not provided, then plainUrlPrefix and course_instance_id must be provided and the appropriate URL prefix will be constructed
  | {
      urlPrefix: string;
      plainUrlPrefix?: undefined;
      courseInstanceId?: undefined;
    }
  | { urlPrefix?: undefined; plainUrlPrefix: string; courseInstanceId: string }
)) {
  if (hideLink) {
    return <span class={`badge color-${assessment.color}`}>{assessment.label}</span>;
  }

  if (publicURL) {
    urlPrefix = `${plainUrlPrefix}/public/course_instance/${courseInstanceId}`;
  } else if (urlPrefix === undefined) {
    // Construct the URL prefix with the appropriate course instance
    urlPrefix = `${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor`;
  }
  return (
    <a
      href={`${urlPrefix}/assessment/${assessment.assessment_id}`}
      class={`btn btn-badge color-${assessment.color}`}
    >
      {assessment.label}
    </a>
  );
}

export function AssessmentBadgeHtml({
  assessment,
  hideLink = false,
  urlPrefix,
  plainUrlPrefix,
  course_instance_id,
  publicURL = false,
}: {
  assessment: { assessment_id: string; color: string; label: string };
  hideLink?: boolean;
  publicURL?: boolean;
} & (
  | {
      urlPrefix: string;
      plainUrlPrefix?: undefined;
      course_instance_id?: undefined;
    }
  | { urlPrefix?: undefined; plainUrlPrefix: string; course_instance_id: string }
)) {
  if (urlPrefix === undefined) {
    return renderHtml(
      <AssessmentBadge
        assessment={assessment}
        hideLink={hideLink}
        plainUrlPrefix={plainUrlPrefix}
        courseInstanceId={course_instance_id}
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
