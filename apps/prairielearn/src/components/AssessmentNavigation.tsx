import { html } from '@prairielearn/html';

import type { Assessment, AssessmentSet } from '../lib/db-types.js';

import { Modal } from './Modal.js';
import type { NavSubPage } from './Navbar.types.js';

/**
 * Dropdown that lets users navigate between assessments in a
 * course instance.
 */
export function AssessmentNavigation({
  courseInstanceId,
  subPage,
  assessment,
  assessmentSet,
  embedded = false,
}: {
  courseInstanceId: string;
  subPage: NavSubPage;
  assessment: Assessment;
  assessmentSet: AssessmentSet;
  /**
   * When true, the switcher renders inline inside the shared navigation bar
   * next to the assessment tabs. It drops its own background/padding (provided
   * by the parent) and constrains its width with `min-width: 0` so the title
   * and QID truncate instead of pushing the tabs out of view.
   */
  embedded?: boolean;
}) {
  return html`
    <div class="${embedded ? '' : 'bg-light pt-2 px-3'}" style="min-width: 0;">
      <button
        type="button"
        class="btn btn-ghost text-start assessment-switcher-button"
        style="max-width: 100%;"
        aria-label="Change assessment"
        aria-haspopup="true"
        aria-expanded="false"
        hx-get="/pl/navbar/course_instance/${courseInstanceId}/assessment/${assessment.id}/switcher${subPage
          ? `?subPage=${subPage}`
          : ''}"
        hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
        data-bs-toggle="modal"
        data-bs-target="#assessmentNavigationModal"
        hx-target="#assessmentNavigationModalContent"
      >
        <span class="d-flex flex-row align-items-center gap-2 w-100">
          <span class="badge color-${assessmentSet.color}">
            ${assessmentSet.abbreviation}${assessment.number}
          </span>
          <span class="d-flex flex-column" style="min-width: 0;">
            <span class="d-flex align-items-center gap-1 dropdown-toggle" style="min-width: 0;">
              ${MiddleTruncatedText({
                text: assessment.title ?? '',
                className: 'h6 mb-0',
                tailLength: 10,
              })}
            </span>
            ${MiddleTruncatedText({
              text: assessment.tid ?? '',
              className: 'text-muted small',
              tailLength: 8,
            })}
          </span>
        </span>
      </button>
      ${AssessmentNavigationModal()}
    </div>
  `;
}

/**
 * Renders text that truncates in the *middle* using a pure-CSS flex technique:
 * the head shrinks and shows an ellipsis only when the available width requires
 * it, while a fixed-length tail stays pinned to the end. Unlike a fixed
 * character limit, the full text is shown whenever it fits. The complete value
 * is exposed via the `title` attribute for hover and accessibility.
 */
function MiddleTruncatedText({
  text,
  className = '',
  tailLength,
}: {
  text: string;
  className?: string;
  tailLength: number;
}) {
  // Split off a fixed-length tail that stays pinned while the head shrinks and
  // ellipsizes. Keep any whitespace at the boundary on the tail (which
  // preserves it via `white-space: pre`) rather than the head, where
  // `text-truncate` collapses the trailing space and makes the two halves run
  // together.
  let splitAt = Math.max(0, text.length - tailLength);
  while (splitAt > 0 && text[splitAt - 1] === ' ') splitAt--;
  return html`
    <span class="d-flex overflow-hidden ${className}" style="min-width: 0;" title="${text}">
      <span class="text-truncate" style="min-width: 0;">${text.slice(0, splitAt)}</span>
      <span class="flex-shrink-0" style="white-space: pre;">${text.slice(splitAt)}</span>
    </span>
  `;
}

function AssessmentNavigationModal() {
  return Modal({
    id: 'assessmentNavigationModal',
    title: 'Select assessment',
    form: false,
    body: html`
      <div id="assessmentNavigationModalContent">
        <div style="width: 100%;" class="d-flex justify-content-center align-items-center">
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading assessments...</span>
          </div>
        </div>
      </div>
    `,
  });
}
