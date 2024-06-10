import { html, escapeHtml } from '@prairielearn/html';

import { Modal } from '../../../src/components/Modal.html.js';
import { AssessmentAccessRules } from '../../../src/pages/instructorAssessmentAccess/instructorAssessmentAccess.types.js';

export function EditAccessRuleModal({
  accessRule,
  index,
  addAccessRule = false,
  timeZoneName,
}: {
  accessRule: AssessmentAccessRules;
  index: number;
  addAccessRule?: boolean;
  timeZoneName: string;
}) {
  return Modal({
    id: `editAccessRuleModal`,
    title: `${addAccessRule ? 'Add Access Rule' : `Edit Access Rule ${index + 1}`}`,
    body: html`
      <div class="form-group">
        <label for="mode">Mode</label>
        <select class="form-control" id="mode" name="mode" aria-describedby="modeHelp">
          <option value="" ${accessRule.mode === '' ? 'selected' : ''}>—</option>
          <option value="Exam" ${accessRule.mode === 'Exam' ? 'selected' : ''}>Exam</option>
          <option value="Public" ${accessRule.mode === 'Public' ? 'selected' : ''}>Public</option>
        </select>
        <small id="modeHelp" class="form-text text-muted">
          Used to restrict access to assessments based on the current mode. In general, it is best
          to use "Public" for any homework and "Exam" for exams proctored with PrairieTest. (See the
          <a
            href="https://prairielearn.readthedocs.io/en/latest/accessControl/#server-modes"
            target="_blank"
            >documentation</a
          >
          for more information.)
        </small>
      </div>
      <div class="form-group">
        <label for="uids">UIDs</label>
        <input
          type="text"
          class="form-control"
          id="uids"
          name="uids"
          value="${accessRule.uids}"
          aria-describedby="uidHelp"
        />
        <small id="uidHelp" class="form-text text-muted">
          Require one of the UIDs in the array to access. Enter UIDs separated by commas or leave
          blank to allow all enrolled students to access.
        </small>
      </div>
      <div class="form-group">
        <label for="start_date">Start date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            step="1"
            class="form-control"
            id="start_date"
            name="start_date"
            value="${accessRule.formatted_start_date}"
            aria-describedby="startDateHelp"
          />
          <div class="input-group-append">
            <span id="startDateHelp" class="input-group-text">${timeZoneName}</span>
          </div>
        </div>
        <small class="form-text text-muted">
          Only allow access after this date. All times are in the timezone of the course
          instance.</small
        >
      </div>
      <div class="form-group">
        <label for="end_date">End date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            step="1"
            class="form-control"
            id="end_date"
            name="end_date"
            value="${accessRule.formatted_end_date}"
            aria-describedby="endDateHelp"
          />
          <div class="input-group-append">
            <span class="input-group-text">${timeZoneName}</span>
          </div>
        </div>
        <small id="endDateHelp" class="form-text text-muted">
          Only allow access before this date. All times are in the timezone of the course
          instance.</small
        >
      </div>
      <div class="form-group">
        <label for="active">Active</label>
        <select class="form-control" id="active" name="active" aria-describedby="activeHelp">
          <option value="True" ${accessRule.active === 'True' ? 'selected' : ''}>True</option>
          <option value="False">False</option>
        </select>
        <small id="activeHelp" class="form-text text-muted">
          Whether the student can create a new assessment instance and submit answers to questions.
        </small>
      </div>
      <div class="form-group">
        <label for="credit">Credit</label>
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            id="credit"
            name="credit"
            value="${accessRule.credit}"
            aria-describedby="creditHelp"
          />
          <div class="input-group-append">
            <span class="input-group-text">%</span>
          </div>
        </div>
        <small id="creditHelp" class="form-text text-muted">
          Maximum credit as percentage of full credit (can be more than 100).
        </small>
      </div>
      <div class="form-group">
        <label for="time_limit">Time limit</label>
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            id="time_limit"
            name="time_limit"
            value="${accessRule.time_limit}"
            aria-describedby="timeLimitHelp"
          />
          <div class="input-group-append">
            <span class="input-group-text">mins</span>
          </div>
        </div>
        <small id="timeLimitHelp" class="form-text text-muted">
          Time limit in minutes to complete an assessment.
        </small>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="text"
          class="form-control"
          id="password"
          name="password"
          value="${accessRule.password}"
          aria-describedby="passwordHelp"
        />
        <small id="passwordHelp" class="form-text text-muted">
          Password required to start an assessment.
        </small>
      </div>
      <div class="form-group">
        <label for="pt_exam_name">PrairieTest Exam UUID</label>
        <input
          type="text"
          class="form-control"
          id="exam_uuid"
          name="exam_uuid"
          value="${accessRule.exam_uuid}"
          aria-describedby="examUuidHelp"
        />
        <small id="examUuidHelp" class="form-text text-muted">
          Links this assessment to a PrairieTest exam.
        </small>
      </div>
    `,
    footer: html`
      <button
        type="button"
        class="btn btn-primary updateAccessRuleButton"
        id="updateAccessRuleButton"
        data-row="${index}"
        data-dismiss="modal"
      >
        ${addAccessRule ? 'Add Access Rule' : 'Update Access Rule'}
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    `,
  });
}
