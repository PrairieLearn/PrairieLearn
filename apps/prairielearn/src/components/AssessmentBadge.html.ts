import { html } from '@prairielearn/html';

export function AssessmentBadge({
  assessment,
  hideLink = false,
  urlPrefix,
  plainUrlPrefix,
  course_instance_id,
}: {
  assessment: { assessment_id: string; color: string; label: string };
  hideLink?: boolean;
} & ( // If urlPrefix is not provided, then plainUrlPrefix and course_instance_id must be provided and the appropriate URL prefix will be constructed
  | {
      urlPrefix: string;
      plainUrlPrefix?: undefined;
      course_instance_id?: undefined;
    }
  | { urlPrefix?: undefined; plainUrlPrefix: string; course_instance_id: string }
)) {
  if (hideLink) {
    return html`
      <span class="badge color-${assessment.color} color-hover">${assessment.label}</span>
    `;
  }
  if (urlPrefix === undefined) {
    // Construct the URL prefix with the appropriate course instance
    urlPrefix = `${plainUrlPrefix}/course_instance/${course_instance_id}/instructor`;
  }
  return html`
    <a
      href="${urlPrefix}/assessment/${assessment.assessment_id}"
      class="badge color-${assessment.color} color-hover"
      onclick="event.stopPropagation();"
    >
      ${assessment.label}
    </a>
  `;
}
