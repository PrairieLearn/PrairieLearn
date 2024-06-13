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
import { AssessmentAccessRulesSchema } from '../../src/pages/instructorAssessmentAccess/instructorAssessmentAccess.types.js';

onDocumentReady(() => {
  const enableEditButton = document.getElementById('enableEditButton');
  const editModeButtons = document.getElementById('editModeButtons');
  const accessRulesTable = document.querySelector('.js-access-rules-table');
  const deleteAccessRuleModal = document.querySelector('.js-delete-access-rule-modal');
  const addRuleButton = document.getElementById('addRuleButton');

  const accessRulesData = AssessmentAccessRulesSchema.array().parse(
    decodeData('access-rules-data'),
  );

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

  on('click', '.editButton', (e) => {
    const editButton = (e.target as HTMLElement).closest('button');
    if (!editButton) return;

    const rowNumber = parseInt(editButton.dataset.row ?? '0');

    $('#editAccessRuleModal').replaceWith(
      (document.createElement('div').innerHTML = EditAccessRuleModal({
        accessRule: accessRulesData[rowNumber],
        addAccessRule: false,
        timeZoneName: timezone,
        rowNumber,
      }).toString()),
    );

    $('#editAccessRuleModal').modal('show');
  });

  on('click', '#updateAccessRuleButton', (e) => {
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

    const rowNumber = accessRulesData.length;
    $('#editAccessRuleModal').replaceWith(
      (document.createElement('div').innerHTML = EditAccessRuleModal({
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
      }).toString()),
    );

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
