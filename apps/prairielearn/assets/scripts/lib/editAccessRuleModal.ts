import { html, escapeHtml, unsafeHtml } from '@prairielearn/html';

import { Modal } from '../../../src/components/Modal.html.js';
import { AssessmentAccessRules } from '../../../src/pages/instructorAssessmentAccess/instructorAssessmentAccess.types.js';

export function EditAccessRuleModal({
  accessRule,
  i,
}: {
  accessRule: AssessmentAccessRules;
  i: number;
}) {
  console.log(accessRule);
  return Modal({
    id: `editAccessRuleModal`,
    title: `Edit Access Rule ${i + 1}`,
    body: html`
      <div class="form-group">
        <label for="mode">Mode</label>
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
        <input type="text" class="form-control" id="uids" name="uids" value="${accessRule.uids}" />
      </div>
      <div class="form-group">
        <label for="start_date">Start date</label>
        <input
          type="datetime-local"
          step="1"
          class="form-control"
          id="start_date"
          name="start_date"
          value="${escapeHtml(accessRule.formatted_start_date)}"
        />
      </div>
      <div class="form-group">
        <label for="end_date">End date</label>
        <input
          type="datetime-local"
          step="1"
          class="form-control"
          id="end_date"
          name="end_date"
          value="${escapeHtml(accessRule.formatted_end_date)}"
        />
      </div>
      <div class="form-group">
        <label for="active">Active</label>
        <select class="form-control" id="active" name="active">
          <option value="true" ${accessRule.active === 'True' ? html`selected` : ''}>True</option>
          <option value="false">False</option>
        </select>
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
          />
          <div class="input-group-append">
            <span class="input-group-text">%</span>
          </div>
        </div>
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
          />
          <div class="input-group-append">
            <span class="input-group-text">mins</span>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
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
        <input
          type="text"
          class="form-control"
          id="pt_exam_name"
          name="pt_exam_name"
          value="${accessRule.pt_exam_name}"
        />
      </div>
    `,
    footer: html`
      <button
        type="button"
        class="btn btn-primary updateAccessRuleButton"
        id="updateAccessRuleButton"
        data-row-number="${i}"
        data-dismiss="modal"
      >
        Update Access Rule
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    `,
  });
}
