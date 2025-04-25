import { html } from '@prairielearn/html';

import type { Assessment } from '../lib/db-types.js';

import { Modal } from './Modal.html.js';
import type { NavSubPage } from './Navbar.types.js';

/**
 * Dropdown that lets users navigate between assessments in a
 * course instance.
 */
export function AssessmentNavigation({
  courseInstanceId,
  subPage,
  assessment,
}: {
  courseInstanceId: string;
  subPage: NavSubPage;
  assessment: Assessment;
}) {
  return html`
    <button 
      type="button"
      class="btn btn-ghost dropdown-toggle dropdown-menu-right d-flex justify-content-between align-items-center mt-2 ms-3"
      style="max-width: 100%;"
      aria-label="Change assessment"
      aria-haspopup="true"
      aria-expanded="false"
      hx-get="/pl/assessments_switcher/course_instance/${courseInstanceId}/assessment/${assessment.id}${subPage
        ? `?subPage=${subPage}`
        : ''}"
      hx-trigger="mouseover once, focus once, show.bs.dropdown once delay:200ms"
      data-bs-toggle="modal"
      data-bs-target="#assessmentNavigationModal"
      hx-target="#assessmentNavigationModalContent"
    >
      <span class="h6 mb-0 me-1 overflow-hidden text-truncate">${assessment.title}</span>
    </button>
    ${AssessmentNavigationModal()}
  `;
}


function AssessmentNavigationModal() {
  return Modal({
      id: 'assessmentNavigationModal',
      title: 'Select assessment',
      formMethod: 'POST',
      body: html`
        <div
          id="assessmentNavigationModalContent"
          class="overflow-auto d-flex justify-content-center align-items-center"
        >
          <div style="width: 30px; height: 30px;">
            <div class="spinner-border spinner-border-sm" role="status">
              <span class="visually-hidden">Loading assessments...</span>
            </div>
          </div>
        </div>
      `
    });
}
