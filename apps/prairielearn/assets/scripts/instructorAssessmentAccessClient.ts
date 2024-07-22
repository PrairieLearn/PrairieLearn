import { Temporal } from '@js-temporal/polyfill';
import { on } from 'delegated-events';
import morphdom from 'morphdom';

import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { Modal } from '../../src/components/Modal.html.js';
import { AssessmentAccessRuleSchema, DateFromISOString } from '../../src/lib/db-types.js';
import {
  AccessRulesTable,
  adjustedDate,
} from '../../src/pages/instructorAssessmentAccess/accessRulesTable.js';
import { EditAccessRuleModal } from '../../src/pages/instructorAssessmentAccess/editAccessRuleModal.js';
import { AssessmentAccessRuleRowSchema } from '../../src/pages/instructorAssessmentAccess/instructorAssessmentAccess.types.js';

onDocumentReady(() => {
  const editButtonsContainer = document.querySelector('.js-edit-buttons-container') as HTMLElement;
  const enableEditButton = document.querySelector('.js-enable-edit-button') as HTMLButtonElement;
  const accessRulesTable = document.querySelector('.js-access-rules-table') as HTMLElement;
  const editAccessRuleModalContainer = document.querySelector(
    '.js-edit-access-rule-modal-container',
  ) as HTMLElement;
  const deleteAccessRuleModalContainer = document.querySelector(
    '.js-delete-access-rule-modal-container',
  ) as HTMLElement;
  const addRuleButton = document.querySelector('.js-add-rule-button') as HTMLButtonElement;

  const accessRulesData = AssessmentAccessRuleRowSchema.array().parse(
    decodeData('access-rules-data'),
  );

  const ptHost = accessRulesTable.dataset.ptHost ?? '';
  const devMode = accessRulesTable.dataset.devMode === 'true';
  const hasCourseInstancePermissionView =
    accessRulesTable.dataset.hasCourseInstancePermissionView === 'true';
  const timezone = accessRulesTable.dataset.timezone ?? 'UTC';

  let editMode = false;

  function refreshTable() {
    morphdom(
      accessRulesTable,
      AccessRulesTable({
        accessRules: accessRulesData,
        ptHost,
        devMode,
        hasCourseInstancePermissionView,
        editMode,
        timezone,
      }).toString(),
    );
  }

  enableEditButton.addEventListener('click', () => {
    editMode = true;
    enableEditButton.style.display = 'none';
    editButtonsContainer.style.removeProperty('display');
    addRuleButton.style.removeProperty('display');
    refreshTable();
  });

  on('click', '.js-save-and-sync-button', () => {
    const form = document.getElementById('accessRulesForm') as HTMLFormElement;
    const assessmentAccessRulesInput = form.querySelector(
      'input[name="assessment_access_rules"]',
    ) as HTMLInputElement;
    if (!assessmentAccessRulesInput) return;
    const accessRulesMap = accessRulesData.map((accessRule: Record<string, any>) => {
      const startDate = accessRule.assessment_access_rule.start_date
        ? adjustedDate(formatDate(new Date(accessRule.assessment_access_rule.start_date), timezone))
            .toISOString()
            .slice(0, 19)
        : null;
      const endDate = accessRule.assessment_access_rule.end_date
        ? adjustedDate(formatDate(new Date(accessRule.assessment_access_rule.end_date), timezone))
            .toISOString()
            .slice(0, 19)
        : null;
      const rule = {
        mode: accessRule.assessment_access_rule.mode,
        uids: accessRule.assessment_access_rule.uids
          ? accessRule.assessment_access_rule.uids
          : null,
        startDate,
        endDate,
        active: accessRule.assessment_access_rule.active ? null : false,
        credit: parseInt(accessRule.assessment_access_rule.credit),
        timeLimitMin: parseInt(accessRule.assessment_access_rule.time_limit_min),
        password: accessRule.assessment_access_rule.password,
        examUuid: accessRule.assessment_access_rule.exam_uuid,
        showClosedAssessment: accessRule.assessment_access_rule.show_closed_assessment
          ? null
          : false,
        showClosedAssessmentScore: accessRule.assessment_access_rule.show_closed_assessment_score
          ? null
          : false,
      };
      const filteredRules = Object.fromEntries(
        Object.entries(rule).filter(([_, value]) => value || value === false),
      );
      return filteredRules;
    });
    assessmentAccessRulesInput.value = JSON.stringify(accessRulesMap);
    form.submit();
  });

  function handleUpdateAccessRule(form: HTMLFormElement) {
    const formData = new FormData(form);
    const updatedAccessRules: Record<string, any> = Object.fromEntries(formData);
    const row = parseInt(updatedAccessRules.row.toString());
    updatedAccessRules.number = parseInt(updatedAccessRules.number);
    updatedAccessRules.mode = updatedAccessRules.mode === '' ? null : updatedAccessRules.mode;
    updatedAccessRules.uids === ''
      ? (updatedAccessRules.uids = null)
      : (updatedAccessRules.uids = updatedAccessRules.uids
          .toString()
          .split(',')
          .map((uid: string) => uid.trim()));
    updatedAccessRules.active = updatedAccessRules.active === 'true';
    updatedAccessRules.show_closed_assessment =
      updatedAccessRules.show_closed_assessment === 'true';
    updatedAccessRules.show_closed_assessment_score =
      updatedAccessRules.show_closed_assessment_score === 'true';

    if ('credit' in updatedAccessRules) {
      if (updatedAccessRules.credit !== '') {
        updatedAccessRules.credit = parseInt(updatedAccessRules.credit);
      } else {
        updatedAccessRules.credit = null;
      }
    } else {
      // The input was disabled, presumably because `"active": false` was selected.
      // Zero out the credit, which is enforced by JSON validation on the backend.
      updatedAccessRules.credit = 0;
    }

    updatedAccessRules.credit !== ''
      ? (updatedAccessRules.credit = parseInt(updatedAccessRules.credit))
      : (updatedAccessRules.credit = null);
    updatedAccessRules.time_limit_min !== ''
      ? (updatedAccessRules.time_limit_min = parseInt(updatedAccessRules.time_limit_min))
      : (updatedAccessRules.time_limit_min = null);
    updatedAccessRules.start_date !== ''
      ? (updatedAccessRules.start_date = DateFromISOString.parse(
          new Date(
            Temporal.PlainDateTime.from(updatedAccessRules.start_date)
              .toZonedDateTime(timezone)
              .toInstant().epochMilliseconds,
          ).toISOString(),
        ))
      : (updatedAccessRules.start_date = null);
    updatedAccessRules.end_date !== ''
      ? (updatedAccessRules.end_date = DateFromISOString.parse(
          new Date(
            Temporal.PlainDateTime.from(updatedAccessRules.end_date)
              .toZonedDateTime(timezone)
              .toInstant().epochMilliseconds,
          ).toISOString(),
        ))
      : (updatedAccessRules.end_date = null);

    accessRulesData[row]
      ? (accessRulesData[row].assessment_access_rule =
          AssessmentAccessRuleSchema.parse(updatedAccessRules))
      : (accessRulesData[row] = {
          assessment_access_rule: AssessmentAccessRuleSchema.parse(updatedAccessRules),
          pt_course: null,
          pt_exam: null,
        });
    refreshTable();
  }

  on('click', '.js-edit-access-rule-button', (e) => {
    const editButton = (e.target as HTMLElement).closest('button');
    if (!editButton) return;

    const rowNumber = parseInt(editButton.closest('tr')?.dataset.index ?? '0');

    editAccessRuleModalContainer.innerHTML = EditAccessRuleModal({
      accessRule: accessRulesData[rowNumber],
      addAccessRule: false,
      timeZoneName: timezone,
      rowNumber,
    }).toString();
    $('#editAccessRuleModal').modal('show');
  });

  // Disable the "credit" input if the access rule is inactive.
  on('change', '#editAccessRuleModal .js-access-rule-active', (e) => {
    const active = (e.target as HTMLInputElement).checked;

    const creditInput = document.querySelector(
      '#editAccessRuleModal .js-access-rule-credit',
    ) as HTMLInputElement;
    if (active) {
      creditInput.removeAttribute('disabled');
      creditInput.value = creditInput.defaultValue;
    } else {
      creditInput.setAttribute('disabled', 'disabled');
      creditInput.value = '0';
    }
  });

  // TODO: add validation that start date is before end date.

  on('click', '.js-save-access-rule-button', (e) => {
    const form = (e.target as HTMLElement).closest('form');
    if (!form) return;
    handleUpdateAccessRule(form);
  });

  function swapRows(row: number, targetRow: number) {
    const accessRule = accessRulesData[row];
    accessRulesData[row] = accessRulesData[targetRow];
    accessRulesData[targetRow] = accessRule;
    refreshTable();
  }

  on('click', '.js-up-arrow-button', (e) => {
    const index = parseInt((e.target as HTMLElement).closest('tr')?.dataset.index ?? '0');
    if (!index) return;
    swapRows(index, index - 1);
  });

  on('click', '.js-down-arrow-button', (e) => {
    const index = parseInt((e.target as HTMLElement).closest('tr')?.dataset.index ?? '0');
    if (index === accessRulesData.length - 1) return;
    swapRows(index, index + 1);
  });

  on('click', '.js-add-rule-button', () => {
    const rowNumber = accessRulesData.length;

    editAccessRuleModalContainer.innerHTML = EditAccessRuleModal({
      accessRule: {
        assessment_access_rule: {
          mode: null,
          uids: null,
          start_date: null,
          end_date: null,
          active: true,
          credit: null,
          time_limit_min: null,
          password: null,
          exam_uuid: null,
          show_closed_assessment: true,
          show_closed_assessment_score: true,
          id: '0',
          assessment_id: '0',
          number: 0,
        },
        pt_course: null,
        pt_exam: null,
      },
      addAccessRule: true,
      timeZoneName: timezone,
      rowNumber,
    }).toString();

    $('#editAccessRuleModal').modal('show');
  });

  on('click', '.js-delete-access-rule-button', (e) => {
    const index = parseInt((e.target as HTMLElement).closest('tr')?.dataset.index ?? '0');
    deleteAccessRuleModalContainer.innerHTML = DeleteConfirmationModal({ index }).toString();
    $('#deleteAccessRuleModal').modal('show');
  });

  on('click', '.js-confirm-delete-access-rule-button', (e) => {
    const index = parseInt((e.target as HTMLElement).dataset.index ?? '0');
    accessRulesData.splice(index, 1);
    refreshTable();
  });
});

function DeleteConfirmationModal({ index }: { index: number }) {
  return Modal({
    id: 'deleteAccessRuleModal',
    title: 'Delete Access Rule',
    body: html` <p>Are you sure you want to delete this access rule?</p> `,
    footer: html`
      <button
        type="button"
        class="btn btn-danger js-confirm-delete-access-rule-button"
        data-dismiss="modal"
        data-index="${index}"
      >
        Delete Access Rule
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
