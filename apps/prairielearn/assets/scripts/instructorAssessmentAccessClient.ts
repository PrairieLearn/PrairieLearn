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
import {
  AssessmentAccessRuleRowSchema,
  JsonAssessmentAccessRuleSchema,
} from '../../src/pages/instructorAssessmentAccess/instructorAssessmentAccess.types.js';

function configureEditValidation(modal: HTMLElement) {
  const activeInput = modal.querySelector('.js-access-rule-active') as HTMLInputElement;
  const creditInput = modal.querySelector('.js-access-rule-credit') as HTMLInputElement;
  const startDateInput = modal.querySelector('.js-access-rule-start-date') as HTMLInputElement;
  const endDateInput = modal.querySelector('.js-access-rule-end-date') as HTMLInputElement;

  function handleActiveChange() {
    const active = activeInput?.checked;

    if (active) {
      creditInput?.removeAttribute('disabled');
      creditInput.value = creditInput?.defaultValue ?? '';
    } else {
      creditInput?.setAttribute('disabled', 'disabled');
      creditInput.value = '0';
    }
  }

  function handleStartDateChange() {
    const startDate = startDateInput?.value;
    if (startDate) {
      endDateInput?.setAttribute('min', startDate);
    }
  }

  // Disable the "credit" input if the access rule is inactive.
  activeInput.addEventListener('change', handleActiveChange);
  handleActiveChange();

  // Ensure that the end date is always after the start date.
  startDateInput.addEventListener('change', handleStartDateChange);
  handleStartDateChange();
}

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

  // Switch to edit mode when the "Edit access rules" button is clicked.
  enableEditButton.addEventListener('click', () => {
    editMode = true;
    enableEditButton.style.display = 'none';
    editButtonsContainer.style.removeProperty('display');
    addRuleButton.style.removeProperty('display');
    refreshTable();
  });

  // Submit the modified access rules when the "Save and sync" button is clicked.
  on('click', '.js-save-and-sync-button', () => {
    const accessRulesMap = accessRulesData.map(({ assessment_access_rule }) => {
      // TODO: is this `adjustedDate` bit necessary?
      const startDate = assessment_access_rule.start_date
        ? adjustedDate(formatDate(new Date(assessment_access_rule.start_date), timezone))
            .toISOString()
            .slice(0, 19)
        : null;
      const endDate = assessment_access_rule.end_date
        ? adjustedDate(formatDate(new Date(assessment_access_rule.end_date), timezone))
            .toISOString()
            .slice(0, 19)
        : null;

      const rule = {
        mode: assessment_access_rule.mode,
        uids: assessment_access_rule.uids ? assessment_access_rule.uids : null,
        startDate,
        endDate,
        active: assessment_access_rule.active ? null : false,
        credit: assessment_access_rule.credit,
        timeLimitMin: assessment_access_rule.time_limit_min,
        password: assessment_access_rule.password?.trim() || null,
        examUuid: assessment_access_rule.exam_uuid?.trim() || null,
        showClosedAssessment: assessment_access_rule.show_closed_assessment ? null : false,
        showClosedAssessmentScore: assessment_access_rule.show_closed_assessment_score
          ? null
          : false,
      };

      // Strip out any null/NaN properties from the rule object.
      return Object.fromEntries(
        Object.entries(rule).filter(([_, value]) => value != null && !Number.isNaN(value)),
      );
    });

    const form = document.getElementById('accessRulesForm') as HTMLFormElement;
    const assessmentAccessRulesInput = form.querySelector(
      'input[name="assessment_access_rules"]',
    ) as HTMLInputElement;

    assessmentAccessRulesInput.value = JSON.stringify(accessRulesMap);
    form.submit();
  });

  // Given a form from the access rule editor modal, add/update the access rule in the table.
  function handleUpdateAccessRule(form: HTMLFormElement) {
    const formData = new FormData(form);
    const updatedAccessRules: Record<string, any> = Object.fromEntries(formData);
    const row = parseInt(updatedAccessRules.row.toString());
    updatedAccessRules.number = parseInt(updatedAccessRules.number);
    updatedAccessRules.mode = updatedAccessRules.mode === '' ? null : updatedAccessRules.mode;

    if (updatedAccessRules.uids !== '') {
      updatedAccessRules.uids = updatedAccessRules.uids
        .toString()
        .split(',')
        .map((uid: string) => uid.trim())
        .filter(Boolean);

      if (updatedAccessRules.uids.length === 0) {
        updatedAccessRules.uids = null;
      }
    } else {
      updatedAccessRules.uids = null;
    }

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

    if (updatedAccessRules.time_limit_min !== '') {
      updatedAccessRules.time_limit_min = parseInt(updatedAccessRules.time_limit_min);
    } else {
      updatedAccessRules.time_limit_min = null;
    }

    if (updatedAccessRules.start_date !== '') {
      updatedAccessRules.start_date = new Date(
        Temporal.PlainDateTime.from(updatedAccessRules.start_date)
          .toZonedDateTime(timezone)
          .toInstant().epochMilliseconds,
      );

      console.log('original start_date string', updatedAccessRules.start_date);
      console.log('plain from new Date()', new Date(updatedAccessRules.start_date));
    } else {
      updatedAccessRules.start_date = null;
    }

    if (updatedAccessRules.end_date !== '') {
      updatedAccessRules.end_date = new Date(
        Temporal.PlainDateTime.from(updatedAccessRules.end_date)
          .toZonedDateTime(timezone)
          .toInstant().epochMilliseconds,
      );
    } else {
      updatedAccessRules.end_date = null;
    }

    console.log('startDate', updatedAccessRules.start_date);
    console.log('endDate', updatedAccessRules.end_date);

    if (accessRulesData[row]) {
      accessRulesData[row].assessment_access_rule =
        JsonAssessmentAccessRuleSchema.parse(updatedAccessRules);
    } else {
      accessRulesData[row] = {
        assessment_access_rule: AssessmentAccessRuleSchema.parse(updatedAccessRules),
        pt_course: null,
        pt_exam: null,
      };
    }

    refreshTable();
  }

  // When the "Edit" button of an access rule is clicked, open the edit modal.
  on('click', '.js-edit-access-rule-button', (e) => {
    const index = parseInt((e.target as HTMLElement).closest('tr')?.dataset.index ?? '0');

    editAccessRuleModalContainer.innerHTML = EditAccessRuleModal({
      accessRule: accessRulesData[index],
      index,
      mode: 'edit',
      timeZoneName: timezone,
    }).toString();
    $('#editAccessRuleModal').modal('show');
    configureEditValidation(editAccessRuleModalContainer);
  });

  // When the "Save" button of the edit modal is clicked, update the access rule in the table.
  on('click', '.js-save-access-rule-button', (e) => {
    const form = (e.target as HTMLElement).closest('form');
    if (!form) return;

    if (form.checkValidity()) {
      handleUpdateAccessRule(form);
      $('#editAccessRuleModal').modal('hide');
    } else {
      form.reportValidity();
    }
  });

  function swapRows(row: number, targetRow: number) {
    const accessRule = accessRulesData[row];
    accessRulesData[row] = accessRulesData[targetRow];
    accessRulesData[targetRow] = accessRule;
    refreshTable();
  }

  // Move the access rule up in the table.
  on('click', '.js-up-arrow-button', (e) => {
    const index = parseInt((e.target as HTMLElement).closest('tr')?.dataset.index ?? '0');
    if (!index) return;
    swapRows(index, index - 1);
  });

  // Move the access rule down in the table.
  on('click', '.js-down-arrow-button', (e) => {
    const index = parseInt((e.target as HTMLElement).closest('tr')?.dataset.index ?? '0');
    if (index === accessRulesData.length - 1) return;
    swapRows(index, index + 1);
  });

  // When the "Add access rule" button is clicked, open the editor modal with
  // a new access rule.
  on('click', '.js-add-rule-button', () => {
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
        },
        pt_course: null,
        pt_exam: null,
      },
      index: accessRulesData.length,
      mode: 'add',
      timeZoneName: timezone,
    }).toString();

    $('#editAccessRuleModal').modal('show');
    configureEditValidation(editAccessRuleModalContainer);
  });

  // When the "Delete" button of an access rule is clicked, open the delete modal.
  on('click', '.js-delete-access-rule-button', (e) => {
    const index = parseInt((e.target as HTMLElement).closest('tr')?.dataset.index ?? '0');
    deleteAccessRuleModalContainer.innerHTML = DeleteConfirmationModal({ index }).toString();
    $('#deleteAccessRuleModal').modal('show');
  });

  // When the "Delete access rule" button of the delete modal is clicked, remove the access rule.
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
