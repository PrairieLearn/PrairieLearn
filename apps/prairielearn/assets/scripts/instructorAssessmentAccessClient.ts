import morphdom from 'morphdom';

import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';

import { formatDate } from '../../src/lib/format.js';

import { AccessRulesTable } from './lib/accessRulesTable.js';
import { EditAccessRuleModal } from './lib/editAccessRuleModal.js';

onDocumentReady(() => {
  const enableEditButton = document.getElementById('enableEditButton');
  const editModeButtons = document.getElementById('editModeButtons');
  const accessRulesTable = document.querySelector('.js-access-rules-table');
  const editAccessRuleModal = document.querySelector('.js-edit-access-rule-modal');
  let updateAccessRuleButton;

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

  const editButtons = document.querySelectorAll('.editButton');
  const upArrowButtons = document.querySelectorAll('.up-arrow-button');
  const downArrowButtons = document.querySelectorAll('.down-arrow-button');

  enableEditButton?.addEventListener('click', () => {
    editMode = true;
    enableEditButton.style.display = 'none';
    editModeButtons?.style.removeProperty('display');
    refreshTable();
  });

  function dateFromString(dateString) {
    const date = new Date(dateString);
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset);
  }

  editButtons.forEach((editButton) => {
    editButton.addEventListener('click', () => {
      const row = (editButton as HTMLElement).dataset.row;
      if (!row) return;
      const accessRule = accessRulesData[row];

      accessRule.formatted_start_date = dateFromString(accessRule.start_date)
        .toISOString()
        .slice(0, 19);
      accessRule.formatted_end_date = dateFromString(accessRule.end_date)
        .toISOString()
        .slice(0, 19);
      morphdom(
        editAccessRuleModal as Node,
        EditAccessRuleModal({ accessRule, i: parseInt(row) }).toString(),
      );
      updateAccessRuleButton = document.getElementById('updateAccessRuleButton');
      updateAccessRuleButton?.addEventListener('click', () => {
        const formData = new FormData(updateAccessRuleButton.form as HTMLFormElement);
        const updatedAccessRules = Object.fromEntries(formData);
        const startDate = dateFromString(updatedAccessRules.start_date);
        updatedAccessRules.start_date = formatDate(startDate, timezone, { includeTz: false });
        accessRulesData[row] = updatedAccessRules;
        refreshTable();
      });
    });
  });

  function swapRows(row: any, targetRow: any) {
    const accessRule = accessRulesData[row];
    accessRulesData[row] = accessRulesData[targetRow];
    accessRulesData[targetRow] = accessRule;
    refreshTable();
  }

  upArrowButtons.forEach((upArrowButton) => {
    upArrowButton.addEventListener('click', () => {
      const row = parseInt((upArrowButton as HTMLElement).dataset.row ?? '0');
      if (!row) return;
      swapRows(row, row - 1);
    });
  });

  downArrowButtons.forEach((downArrowButton) => {
    downArrowButton.addEventListener('click', () => {
      const row = parseInt((downArrowButton as HTMLElement).dataset.row ?? '0');
      if (row === accessRulesData.length - 1) return;
      swapRows(row, row + 1);
    });
  });

  // saveAndSyncButton?.addEventListener('click', () => {
  //   document.getElementById('accessRulesForm')?.submit();
  // });
});
