import { Temporal } from '@js-temporal/polyfill';
import { on } from 'delegated-events';
import morphdom from 'morphdom';

import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { Modal } from '../../src/components/Modal.html.js';

import { AccessRulesTable } from './lib/accessRulesTable.js';
import { EditAccessRuleModal } from './lib/editAccessRuleModal.js';

onDocumentReady(() => {
  const enableEditButton = document.getElementById('enableEditButton');
  const editModeButtons = document.getElementById('editModeButtons');
  const accessRulesTable = document.querySelector('.js-access-rules-table');
  const editAccessRuleModal = document.querySelector('.js-edit-access-rule-modal');
  const deleteAccessRuleModal = document.querySelector('.js-delete-access-rule-modal');

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
      }).toString(),
    );
  }

  refreshTable();

  const addRuleButton = document.getElementById('addRuleButton');

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
    accessRulesData.forEach((accessRule: Record<string, any>) => {
      accessRule.startDate = adjustedDate(accessRule.start_date).toISOString().slice(0, 19);
      accessRule.endDate = adjustedDate(accessRule.end_date).toISOString().slice(0, 19);
      accessRule.timeLimitMin = parseInt(accessRule.time_limit);
      accessRule.uids = accessRule.uids.split(',').map((uid: string) => uid.trim());
      accessRule.credit = parseInt(accessRule.credit);
      if (accessRule.exam) {
        accessRule.examUuid = accessRule.exam_uuid;
      }
      delete accessRule.formatted_start_date;
      delete accessRule.formatted_end_date;
      delete accessRule.start_date;
      delete accessRule.end_date;
      delete accessRule.time_limit;
      delete accessRule.pt_course_name;
      delete accessRule.pt_exam_name;
      delete accessRule.pt_course_id;
      delete accessRule.pt_exam_id;
      delete accessRule.exam_uuid;
      if (accessRule.active === 'True' || accessRule.active === 'true') {
        accessRule.active = true;
      } else {
        accessRule.active = false;
      }
    });
    assessmentAccessRulesInput.value = JSON.stringify(accessRulesData);
    form.submit();
  });

  function adjustedDate(dateString: string | Date) {
    const date = new Date(dateString);
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset);
  }

  let timeZoneName: string | undefined;
  // To use Temporal polyfill, we need to check if Temporal is available in the environment
  if (typeof Temporal !== 'undefined') {
    const now = Temporal.Now.zonedDateTimeISO(timezone);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    timeZoneName = formatter
      .formatToParts(now.toInstant().epochMilliseconds)
      .find((part) => part.type === 'timeZoneName')?.value;
  } else {
    console.error('Temporal API is not available in this environment.');
  }

  function handleUpdateAccessRule({ form, row }: { form: HTMLFormElement; row: number }) {
    const formData = new FormData(form);
    const updatedAccessRules = Object.fromEntries(formData);
    const startDate = adjustedDate(updatedAccessRules.start_date.toString());
    const endDate = adjustedDate(updatedAccessRules.end_date.toString());
    updatedAccessRules.start_date =
      formatDate(startDate, 'UTC', { includeTz: false }) + ` (${timeZoneName})`;
    updatedAccessRules.end_date =
      formatDate(endDate, 'UTC', { includeTz: false }) + ` (${timeZoneName})`;
    accessRulesData[row] = updatedAccessRules;
    refreshTable();
  }

  on('click', '.editButton', (e) => {
    const row = parseInt((e.target as HTMLElement).closest('button')?.dataset.row ?? '0');
    const accessRule = accessRulesData[row];
    accessRule.formatted_start_date = adjustedDate(accessRule.start_date)
      .toISOString()
      .slice(0, 19);
    accessRule.formatted_end_date = adjustedDate(accessRule.end_date).toISOString().slice(0, 19);
    if (!timeZoneName) {
      throw new Error('Course instance time zone is not available.');
    }
    morphdom(
      editAccessRuleModal as Node,
      EditAccessRuleModal({ accessRule, i: row, timeZoneName }).toString(),
    );
    $('#editAccessRuleModal').modal('show');
  });

  on('click', '#updateAccessRuleButton', (e) => {
    const row = parseInt((e.target as HTMLElement).closest('button')?.dataset.row ?? '0');
    const form = (e.target as HTMLElement).closest('form');
    if (!form) return;
    handleUpdateAccessRule({ form, row });
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
    const formatted_start_date = adjustedDate(new Date()).toISOString().slice(0, 19);
    const formatted_end_date = adjustedDate(new Date()).toISOString().slice(0, 19);
    if (!timeZoneName) {
      throw new Error('Course instance time zone is not available.');
    }
    morphdom(
      editAccessRuleModal as Node,
      EditAccessRuleModal({
        accessRule: {
          mode: '',
          uids: '',
          start_date: new Date().toISOString().slice(0, 19),
          end_date: new Date().toISOString().slice(0, 19),
          active: 'True',
          credit: '100',
          time_limit: '50',
          password: '',
          formatted_start_date,
          formatted_end_date,
          exam_uuid: null,
          pt_course_id: null,
          pt_course_name: null,
          pt_exam_id: null,
          pt_exam_name: null,
        },
        i: accessRulesData.length,
        addAccessRule: true,
        timeZoneName,
      }).toString(),
    );
    $('#editAccessRuleModal').modal('show');
  });

  on('click', '.deleteButton', (e) => {
    const row = parseInt((e.target as HTMLElement).closest('button')?.dataset.row ?? '0');
    morphdom(deleteAccessRuleModal as Node, DeleteConfirmationModal().toString());
    $('#deleteAccessRuleModal').modal('show');
    document.getElementById('confirmDeleteButton')?.addEventListener('click', () => {
      accessRulesData.splice(row, 1);
      refreshTable();
    });
  });
});

function DeleteConfirmationModal() {
  return Modal({
    id: 'deleteAccessRuleModal',
    title: 'Delete Access Rule',
    body: html` <p>Are you sure you want to delete this access rule?</p> `,
    footer: html`
      <button type="button" class="btn btn-danger" id="confirmDeleteButton" data-dismiss="modal">
        Delete Access Rule
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
