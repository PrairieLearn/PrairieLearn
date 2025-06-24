import { renderHtml } from '../lib/preact-html.js';

export function AssessmentBadgeJsx({
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
} & ( // If urlPrefix is not provided, then plainUrlPrefix and course_instance_id must be provided and the appropriate URL prefix will be constructed
  | {
      urlPrefix: string;
      plainUrlPrefix?: undefined;
      course_instance_id?: undefined;
    }
  | { urlPrefix?: undefined; plainUrlPrefix: string; course_instance_id: string }
)) {
  if (hideLink) {
    return <span class="badge color-${assessment.color}">${assessment.label}</span>;
  }

  if (publicURL) {
    urlPrefix = `${plainUrlPrefix}/public/course_instance/${course_instance_id}`;
  } else if (urlPrefix === undefined) {
    // Construct the URL prefix with the appropriate course instance
    urlPrefix = `${plainUrlPrefix}/course_instance/${course_instance_id}/instructor`;
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
export function AssessmentBadge({
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
      <AssessmentBadgeJsx
        assessment={assessment}
        hideLink={hideLink}
        plainUrlPrefix={plainUrlPrefix}
        course_instance_id={course_instance_id}
        publicURL={publicURL}
      />,
    ).toString();
  }
  return renderHtml(
    <AssessmentBadgeJsx
      assessment={assessment}
      hideLink={hideLink}
      urlPrefix={urlPrefix ?? undefined}
      plainUrlPrefix={plainUrlPrefix}
      course_instance_id={course_instance_id}
      publicURL={publicURL}
    />,
  ).toString();
}
