import { Temporal } from '@js-temporal/polyfill';

import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';

import { AssessmentAccessRuleRow } from './instructorAssessmentAccess.types.js';

export function EditAccessRuleModal({
  accessRule,
  addAccessRule,
  timeZoneName,
  rowNumber,
}: {
  accessRule: AssessmentAccessRuleRow;
  addAccessRule: boolean;
  timeZoneName: string;
  rowNumber: number;
}) {
  return Modal({
    id: 'editAccessRuleModal',
    title: `${addAccessRule ? 'Add access rule' : 'Edit access rule'}`,
    body: html`
      <div class="form-group">
        <input type="hidden" name="row" class="access-rule-row" value="${rowNumber}" />
        <input
          type="hidden"
          name="id"
          class="access-rule-id"
          value="${accessRule.assessment_access_rule.id}"
        />
        <input
          type="hidden"
          name="assessment_id"
          class="access-rule-assessment-id"
          value="${accessRule.assessment_access_rule.assessment_id}"
        />
        <input
          type="hidden"
          name="number"
          class="access-rule-number"
          value="${accessRule.assessment_access_rule.number}"
        />
        <label for="mode">Mode</label>
        <select
          class="form-control access-rule-mode"
          id="mode"
          name="mode"
          aria-describedby="modeHelp"
        >
          <option value="" ${accessRule.assessment_access_rule.mode === null ? 'selected' : ''}>
            —
          </option>
          <option
            value="Exam"
            ${accessRule.assessment_access_rule.mode === 'Exam' ? 'selected' : ''}
          >
            Exam
          </option>
          <option
            value="Public"
            ${accessRule.assessment_access_rule.mode === 'Public' ? 'selected' : ''}
          >
            Public
          </option>
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
          class="form-control access-rule-uids"
          id="uids"
          name="uids"
          aria-describedby="uidHelp"
          value="${accessRule.assessment_access_rule.uids?.join(', ')}"
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
            class="form-control access-rule-start-date"
            id="start_date"
            name="start_date"
            aria-describedby="startDateHelp"
            value="${accessRule.assessment_access_rule.start_date
              ? Temporal.Instant.from(accessRule.assessment_access_rule.start_date.toISOString())
                  .toZonedDateTimeISO(timeZoneName)
                  .toString()
                  .slice(0, 19)
              : ''}"
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
            class="form-control access-rule-end-date"
            id="end_date"
            name="end_date"
            aria-describedby="endDateHelp"
            value="${accessRule.assessment_access_rule.end_date
              ? Temporal.Instant.from(accessRule.assessment_access_rule.end_date.toISOString())
                  .toZonedDateTimeISO(timeZoneName)
                  .toString()
                  .slice(0, 19)
              : ''}"
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
        <select
          class="form-control access-rule-active"
          id="active"
          name="active"
          aria-describedby="activeHelp"
        >
          <option value="true" ${accessRule.assessment_access_rule.active ? 'selected' : ''}>
            True
          </option>
          <option value="false" ${accessRule.assessment_access_rule.active ? '' : 'selected'}>
            False
          </option>
        </select>
        <small id="activeHelp" class="form-text text-muted">
          Whether the student can create a new assessment instance and submit answers to questions.
        </small>
      </div>
      <div class="form-group">
        <label for="credit">Credit</label>
        <div class="input-group">
          <input
            type="number"
            class="form-control access-rule-credit"
            id="credit"
            name="credit"
            aria-describedby="creditHelp"
            value="${accessRule.assessment_access_rule.credit}"
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
        <label for="time_limit_min">Time limit</label>
        <div class="input-group">
          <input
            type="number"
            class="form-control access-rule-time-limit"
            id="time_limit_min"
            name="time_limit_min"
            aria-describedby="timeLimitHelp"
            value="${accessRule.assessment_access_rule.time_limit_min}"
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
          class="form-control access-rule-password"
          id="password"
          name="password"
          aria-describedby="passwordHelp"
          value="${accessRule.assessment_access_rule.password}"
        />
        <small id="passwordHelp" class="form-text text-muted">
          Password required to start an assessment.
        </small>
      </div>
      <div class="form-group">
        <label for="exam_uuid">PrairieTest Exam UUID</label>
        <input
          type="text"
          class="form-control access-rule-exam-uuid"
          id="exam_uuid"
          name="exam_uuid"
          aria-describedby="examUuidHelp"
          value="${accessRule.assessment_access_rule.exam_uuid}"
        />
        <small id="examUuidHelp" class="form-text text-muted">
          Links this assessment to a PrairieTest exam.
        </small>
      </div>
      <div class="form-group">
        <label for="show_closed_assessment">Show closed assessment</label>
        <select
          class="form-control access-rule-show-closed-assessment"
          name="show_closed_assessment"
          aria-describedby="showClosedAssessmentHelp"
        >
          <option
            value="true"
            ${accessRule.assessment_access_rule.show_closed_assessment ? 'selected' : ''}
          >
            True
          </option>
          <option
            value="false"
            ${accessRule.assessment_access_rule.show_closed_assessment ? '' : 'selected'}
          >
            False
          </option>
        </select>
        <small id="showClosedAssessmentHelp" class="form-text text-muted">
          Whether to allow viewing of assessment contents when closed.
        </small>
      </div>
      <div class="form-group">
        <label for="show_closed_assessment_score">Show closed assessment score</label>
        <select
          class="form-control access access-rule-show-closed-assessment-score"
          name="show_closed_assessment_score"
          aria-describedby="showClosedAssessmentScoreHelp"
        >
          <option
            value="true"
            ${accessRule.assessment_access_rule.show_closed_assessment_score ? 'selected' : ''}
          >
            True
          </option>
          <option
            value="false"
            ${accessRule.assessment_access_rule.show_closed_assessment_score ? '' : 'selected'}
          >
            False
          </option>
        </select>
        <small id="showClosedAssessmentScoreHelp" class="form-text text-muted">
          Whether to allow viewing of the score of a closed assessment.
        </small>
      </div>
    `,
    footer: html`
      <button type="button" class="btn btn-primary js-save-access-rule-button" data-dismiss="modal">
        ${addAccessRule ? 'Add access rule' : 'Update access rule'}
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    `,
  });
}
