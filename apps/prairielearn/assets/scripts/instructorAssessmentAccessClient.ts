import { Temporal } from '@js-temporal/polyfill';
import { on } from 'delegated-events';
import morphdom from 'morphdom';

import { onDocumentReady, decodeData, templateFromAttributes } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { Modal } from '../../src/components/Modal.html.js';
import { AccessRulesTable } from '../../src/pages/instructorAssessmentAccess/accessRulesTable.js';

onDocumentReady(() => {
  const enableEditButton = document.getElementById('enableEditButton');
  const editModeButtons = document.getElementById('editModeButtons');
  const accessRulesTable = document.querySelector('.js-access-rules-table');
  const editAccessRuleModal = document.querySelector('#editAccessRuleModal');
  const deleteAccessRuleModal = document.querySelector('.js-delete-access-rule-modal');
  const addRuleButton = document.getElementById('addRuleButton');

  const accessRulesData = decodeData('access-rules-data');

  const ptHost = (accessRulesTable as HTMLElement)?.dataset.ptHost ?? '';
  const devMode = (accessRulesTable as HTMLElement)?.dataset.devMode === 'true';
  const hasCourseInstancePermissionView =
    (accessRulesTable as HTMLElement)?.dataset.hasCourseInstancePermissionView === 'true';
  const timezone = (accessRulesTable as HTMLElement)?.dataset.timezone ?? 'UTC';

  let editMode = false;

  function refreshTable() {
    morphdom(
      accessRulesTable as Node,
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

  enableEditButton?.addEventListener('click', () => {
    editMode = true;
    enableEditButton.style.display = 'none';
    editModeButtons?.style.removeProperty('display');
    addRuleButton?.style.removeProperty('display');
    refreshTable();
  });

  on('click', '#saveAndSyncButton', () => {
    const form = document.getElementById('accessRulesForm') as HTMLFormElement;
    const assessmentAccessRulesInput = form.querySelector(
      'input[name="assessment_access_rules"]',
    ) as HTMLInputElement;
    if (!assessmentAccessRulesInput) return;
    const accessRulesMap = accessRulesData.map((accessRule: Record<string, any>) => {
      const rule = {
        mode: accessRule.assessment_access_rule.mode,
        uids: accessRule.assessment_access_rule.uids
          ? accessRule.assessment_access_rule.uids
          : null,
        startDate: adjustedDate(accessRule.assessment_access_rule.start_date)
          .toISOString()
          .slice(0, 19),
        endDate: adjustedDate(accessRule.assessment_access_rule.end_date)
          .toISOString()
          .slice(0, 19),
        active: accessRule.assessment_access_rule.active,
        credit: parseInt(accessRule.assessment_access_rule.credit),
        timeLimitMin: parseInt(accessRule.assessment_access_rule.time_limit_mins),
        password: accessRule.assessment_access_rule.password,
        examUuid: accessRule.assessment_access_rule.exam_uuid,
      };
      const filteredRules = Object.fromEntries(Object.entries(rule).filter(([_, value]) => value));
      return filteredRules;
    });
    assessmentAccessRulesInput.value = JSON.stringify(accessRulesMap);
    form.submit();
  });

  function adjustedDate(dateString: string | Date) {
    const date = new Date(dateString);
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset);
  }

  function handleUpdateAccessRule({ form }: { form: HTMLFormElement }) {
    const formData = new FormData(form);
    const updatedAccessRules: Record<string, any> = Object.fromEntries(formData);
    const row = parseInt(updatedAccessRules.row.toString());
    updatedAccessRules.uids = updatedAccessRules.uids
      .toString()
      .split(',')
      .map((uid: string) => uid.trim());
    updatedAccessRules.active = updatedAccessRules.active === 'true';

    updatedAccessRules.start_date = new Date(
      Temporal.PlainDateTime.from(updatedAccessRules.start_date)
        .toZonedDateTime(timezone)
        .toInstant().epochMilliseconds,
    ).toISOString();

    updatedAccessRules.end_date = new Date(
      Temporal.PlainDateTime.from(updatedAccessRules.end_date)
        .toZonedDateTime(timezone)
        .toInstant().epochMilliseconds,
    ).toISOString();

    if (accessRulesData[row]) {
      accessRulesData[row].assessment_access_rule = updatedAccessRules;
    } else {
      accessRulesData[row] = { assessment_access_rule: updatedAccessRules };
    }
    refreshTable();
  }

  on('click', '.editButton', (e) => {
    const editButton = (e.target as HTMLElement).closest('button');
    if (!editButton) return;

    templateFromAttributes(editButton, editAccessRuleModal as HTMLElement, {
      'data-row': '.access-rule-row',
      'data-title-text': '.modal-title',
      'data-submit-text': '.updateAccessRuleButton',
      'data-access-rule-mode': '.access-rule-mode',
      'data-access-rule-uids': '.access-rule-uids',
      'data-access-rule-start-date': '.access-rule-start-date',
      'data-access-rule-end-date': '.access-rule-end-date',
      'data-access-rule-active': '.access-rule-active',
      'data-access-rule-credit': '.access-rule-credit',
      'data-access-rule-time-limit': '.access-rule-time-limit',
      'data-access-rule-password': '.access-rule-password',
      'data-access-rule-exam-uuid': '.access-rule-exam-uuid',
    });

    $('#editAccessRuleModal').modal('show');
  });

  on('click', '#updateAccessRuleButton', (e) => {
    const form = (e.target as HTMLElement).closest('form');
    if (!form) return;
    handleUpdateAccessRule({ form });
  });

  function swapRows(row: any, targetRow: any) {
    const accessRule = accessRulesData[row];
    accessRulesData[row] = accessRulesData[targetRow];
    accessRulesData[targetRow] = accessRule;
    refreshTable();
  }

  on('click', '.up-arrow-button', (e) => {
    const row = parseInt((e.target as HTMLElement).closest('button')?.dataset.row ?? '0');
    if (!row) return;
    swapRows(row, row - 1);
  });

  on('click', '.down-arrow-button', (e) => {
    const row = parseInt((e.target as HTMLElement).closest('button')?.dataset.row ?? '0');
    if (row === accessRulesData.length - 1) return;
    swapRows(row, row + 1);
  });

  on('click', '#addRuleButton', () => {
    const addRuleButton = document.getElementById('addRuleButton');
    if (!addRuleButton) return;

    templateFromAttributes(addRuleButton, editAccessRuleModal as HTMLElement, {
      'data-row': '.access-rule-row',
      'data-title-text': '.modal-title',
      'data-submit-text': '.updateAccessRuleButton',
      'data-access-rule-mode': '.access-rule-mode',
      'data-access-rule-uids': '.access-rule-uids',
      'data-access-rule-start-date': '.access-rule-start-date',
      'data-access-rule-end-date': '.access-rule-end-date',
      'data-access-rule-active': '.access-rule-active',
      'data-access-rule-credit': '.access-rule-credit',
      'data-access-rule-time-limit': '.access-rule-time-limit',
      'data-access-rule-password': '.access-rule-password',
      'data-access-rule-exam-uuid': '.access-rule-exam-uuid',
    });
    $('#editAccessRuleModal').modal('show');
  });

  on('click', '.deleteButton', (e) => {
    const row = parseInt((e.target as HTMLElement).closest('button')?.dataset.row ?? '0');
    morphdom(deleteAccessRuleModal as Node, DeleteConfirmationModal({ row }).toString());
    $('#deleteAccessRuleModal').modal('show');
  });
  on('click', '#confirmDeleteButton', (e) => {
    const row = parseInt((e.target as HTMLElement).dataset.row ?? '0');
    accessRulesData.splice(row, 1);
    refreshTable();
  });
});

function DeleteConfirmationModal({ row }: { row: number }) {
  return Modal({
    id: 'deleteAccessRuleModal',
    title: 'Delete Access Rule',
    body: html` <p>Are you sure you want to delete this access rule?</p> `,
    footer: html`
      <button
        type="button"
        class="btn btn-danger"
        id="confirmDeleteButton"
        data-dismiss="modal"
        data-row="${row}"
      >
        Delete Access Rule
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
