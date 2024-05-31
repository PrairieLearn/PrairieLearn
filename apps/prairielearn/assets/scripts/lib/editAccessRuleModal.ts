import { html, escapeHtml } from '@prairielearn/html';

import { Modal } from '../../../src/components/Modal.html.js';
import { AssessmentAccessRules } from '../../../src/pages/instructorAssessmentAccess/instructorAssessmentAccess.types.js';

export function EditAccessRuleModal({
  accessRule,
  i,
  addAccessRule = false,
  timeZoneName,
}: {
  accessRule: AssessmentAccessRules;
  i: number;
  addAccessRule?: boolean;
  timeZoneName: string;
}) {
  return Modal({
    id: `editAccessRuleModal`,
    title: `${addAccessRule ? 'Add Access Rule' : `Edit Access Rule ${i + 1}`}`,
    body: html`
      <div class="form-group">
        <label for="mode">Mode</label>
        <small class="form-text text-muted">
          Used to restrict access to assessments based on the current mode. In general, it is best
          to use "Public" for any homework and "Exam" for exams in the Computer Based Testing
          Facility.
        </small>
        <select class="form-control" id="mode" name="mode">
          <option value="" ${accessRule.mode === '' ? html`selected` : ''}>—</option>
          <option value="Exam" ${accessRule.mode === 'Exam' ? html`selected` : ''}>Exam</option>
          <option value="Public" ${accessRule.mode === 'Public' ? html`selected` : ''}>
            Public
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="uids">UIDs</label>
        <small class="form-text text-muted">
          Require one of the UIDs in the array to access. Enter UIDs separated by commas or leave
          blank to allow all enrolled students to access.
        </small>
        <input type="text" class="form-control" id="uids" name="uids" value="${accessRule.uids}" />
      </div>
      <div class="form-group">
        <label for="start_date">Start date</label>
        <small class="form-text text-muted">
          Only allow access after this date. All times are in the timezone of the course
          instance.</small
        >
        <div class="input-group">
          <input
            type="datetime-local"
            step="1"
            class="form-control"
            id="start_date"
            name="start_date"
            value="${escapeHtml(html`${accessRule.formatted_start_date}`)}"
          />
          <div class="input-group-append">
            <span class="input-group-text">${timeZoneName}</span>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label for="end_date">End date</label>
        <small class="form-text text-muted">
          Only allow access before this date. All times are in the timezone of the course
          instance.</small
        >
        <div class="input-group">
          <input
            type="datetime-local"
            step="1"
            class="form-control"
            id="end_date"
            name="end_date"
            value="${escapeHtml(html`${accessRule.formatted_end_date}`)}"
          />
          <div class="input-group-append">
            <span class="input-group-text">${timeZoneName}</span>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label for="active">Active</label>
        <small class="form-text text-muted">
          Whether the student can create a new assessment instance and submit answers to questions.
        </small>
        <select class="form-control" id="active" name="active">
          <option value="True" ${accessRule.active === 'True' ? html`selected` : ''}>True</option>
          <option value="False">False</option>
        </select>
      </div>
      <div class="form-group">
        <label for="credit">Credit</label>
        <small class="form-text text-muted">
          Maximum credit as percentage of full credit (can be more than 100).
        </small>
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            id="credit"
            name="credit"
            value="${accessRule.credit}"
          />
          <div class="input-group-append">
            <span class="input-group-text">%</span>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label for="time_limit">Time limit</label>
        <small class="form-text text-muted">
          Time limit in minutes to complete an assessment (only for Exams).
        </small>
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            id="time_limit"
            name="time_limit"
            value="${accessRule.time_limit}"
          />
          <div class="input-group-append">
            <span class="input-group-text">mins</span>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <small class="form-text text-muted">
          Password required to start an assessment (only for Exams).
        </small>
        <input
          type="text"
          class="form-control"
          id="password"
          name="password"
          value="${accessRule.password}"
        />
      </div>
      <div class="form-group">
        <label for="pt_exam_name">PrairieTest Exam</label>
        <small class="form-text text-muted">
          PrairieTest UUID for the exam that students must register for.
        </small>
        <input
          type="text"
          class="form-control"
          id="exam_uuid"
          name="exam_uuid"
          value="${accessRule.exam_uuid}"
        />
      </div>
    `,
    footer: html`
      <button
        type="button"
        class="btn btn-primary updateAccessRuleButton"
        id="updateAccessRuleButton"
        data-row="${i}"
        data-dismiss="modal"
      >
        ${addAccessRule ? 'Add Access Rule' : 'Update Access Rule'}
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    `,
  });
}
