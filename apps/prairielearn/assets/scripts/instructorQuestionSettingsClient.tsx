import TomSelect from 'tom-select';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { TagBadge } from '../../src/components/TagBadge.js';
import { TopicBadgeHtml } from '../../src/components/TopicBadge.js';
import { type Tag, type Topic } from '../../src/lib/db-types.js';

import { saveButtonEnabling } from './lib/saveButtonEnabling.js';
import { validateId } from './lib/validateId.js';

onDocumentReady(() => {
  const qidField = document.querySelector<HTMLInputElement>('input[name="qid"]')!;
  const otherQids = qidField.dataset.otherValues?.split(',') ?? [];
  const questionSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-question-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');
  const showExternalGradingOptionsButton = document.querySelector<HTMLButtonElement>(
    '#show-external-grading-options-button',
  );
  const showWorkspaceOptionsButton = document.querySelector<HTMLButtonElement>(
    '#show-workspace-options-button',
  );
  const workspaceOptions = document.querySelector<HTMLDivElement>('#workspace-options');
  const workspaceImageInput = document.querySelector<HTMLInputElement>('#workspace_image');
  const workspacePortInput = document.querySelector<HTMLInputElement>('#workspace_port');
  const workspaceHomeInput = document.querySelector<HTMLInputElement>('#workspace_home');
  const workspaceEnvironmentInput =
    document.querySelector<HTMLInputElement>('#workspace_environment');
  const externalGradingOptions = document.querySelector<HTMLDivElement>(
    '#external-grading-options',
  );
  const externalGradingImageInput =
    document.querySelector<HTMLInputElement>('#external_grading_image');
  const externalGradingEnvironmentInput = document.querySelector<HTMLInputElement>(
    '#external_grading_environment',
  );

  let workspaceOptionsShown = showWorkspaceOptionsButton?.getAttribute('hidden') === 'true';
  let externalGradingOptionsShown = showExternalGradingOptionsButton!.hidden;

  function updateWorkspaceOptionsValidation() {
    if (workspaceOptionsShown) {
      workspaceImageInput?.setAttribute('required', 'true');
      workspacePortInput?.setAttribute('required', 'true');
      workspaceHomeInput?.setAttribute('required', 'true');
    } else {
      workspaceImageInput?.removeAttribute('required');
      workspacePortInput?.removeAttribute('required');
      workspaceHomeInput?.removeAttribute('required');
    }
  }

  function updateExternalGradingOptionsValidation() {
    if (externalGradingOptionsShown) {
      externalGradingImageInput?.setAttribute('required', 'true');
    } else {
      externalGradingImageInput?.removeAttribute('required');
    }
  }

  function validateJsonInput(input: HTMLInputElement) {
    if (input.value === '') {
      input.setCustomValidity('');
      return;
    }
    try {
      const value = JSON.parse(input.value);
      if (typeof value !== 'object' || Array.isArray(value)) {
        input.setCustomValidity('Invalid JSON object format');
      } else {
        input.setCustomValidity('');
      }
    } catch {
      input.setCustomValidity('Invalid JSON object format');
    }
  }

  if (document.getElementById('topic')) {
    new TomSelect('#topic', {
      valueField: 'name',
      searchField: ['name', 'description'],
      closeAfterSelect: true,
      plugins: ['no_backspace_delete'],
      maxItems: 1,
      render: {
        option(data: Topic) {
          return html`
            <div>
              ${TopicBadgeHtml(data)}
              <div>
                <small>${data.description}</small>
              </div>
            </div>
          `.toString();
        },
        item(data: Topic) {
          return TopicBadgeHtml(data).toString();
        },
      },
    });
  }

  if (document.getElementById('tags')) {
    new TomSelect('#tags', {
      valueField: 'name',
      searchField: ['name', 'description'],
      plugins: ['remove_button'],
      render: {
        option(data: Tag) {
          return html`
            <div>
              ${renderHtml(<TagBadge tag={data} />)}
              <div>
                <small>${data.description}</small>
              </div>
            </div>
          `.toString();
        },
        item(data: Tag) {
          return html`<span class="badge color-${data.color} me-1">${data.name}</span>`.toString();
        },
      },
    });
  }

  qidField.addEventListener('input', () => validateId({ input: qidField, otherIds: otherQids }));
  qidField.addEventListener('change', () => validateId({ input: qidField, otherIds: otherQids }));

  workspaceEnvironmentInput?.addEventListener('input', (e) => {
    validateJsonInput(e.target as HTMLInputElement);
  });

  externalGradingEnvironmentInput?.addEventListener('input', (e) => {
    validateJsonInput(e.target as HTMLInputElement);
  });

  if (questionSettingsForm && saveButton) {
    saveButtonEnabling(questionSettingsForm, saveButton);
  }

  updateWorkspaceOptionsValidation();
  updateExternalGradingOptionsValidation();
  showWorkspaceOptionsButton?.addEventListener('click', () => {
    workspaceOptions?.removeAttribute('hidden');
    showWorkspaceOptionsButton.setAttribute('hidden', 'true');
    workspaceOptionsShown = true;
    updateWorkspaceOptionsValidation();
  });
  showExternalGradingOptionsButton?.addEventListener('click', () => {
    externalGradingOptions?.removeAttribute('hidden');
    showExternalGradingOptionsButton.setAttribute('hidden', 'true');
    externalGradingOptionsShown = true;
    updateExternalGradingOptionsValidation();
  });

  questionSettingsForm?.addEventListener('submit', (e) => {
    if (!questionSettingsForm.checkValidity()) {
      e.preventDefault();
      questionSettingsForm.reportValidity();
    }
  });

  const addAuthorButton = document.querySelector<HTMLButtonElement>('#add-author-button');
  const table = document.getElementById('author-table-body');
  addAuthorButton?.addEventListener('click', () => {
    const rows = table?.getElementsByClassName('author-row');
    const numRows = rows?.length ?? 0;
    const newRow = document.createElement('tr');
    newRow.setAttribute('class', 'author-row');
    newRow.setAttribute('id', 'author_row_' + numRows);
    let tableData = document.createElement('td');
    tableData.setAttribute('class', 'align-middle');
    const nameInput = document.createElement('input');
    nameInput.setAttribute('type', 'text');
    nameInput.setAttribute('class', 'form-control');
    nameInput.setAttribute('id', 'author_name_' + numRows);
    nameInput.setAttribute('name', 'author_name_' + numRows);
    tableData.appendChild(nameInput);
    newRow.appendChild(tableData);

    tableData = document.createElement('td');
    tableData.setAttribute('class', 'align-middle');
    const emailInput = document.createElement('input');
    emailInput.setAttribute('type', 'text');
    emailInput.setAttribute('class', 'form-control');
    emailInput.setAttribute('id', 'author_email_' + numRows);
    emailInput.setAttribute('name', 'author_email_' + numRows);
    tableData.appendChild(emailInput);
    newRow.appendChild(tableData);

    tableData = document.createElement('td');
    tableData.setAttribute('class', 'align-middle');
    const orcidInput = document.createElement('input');
    orcidInput.setAttribute('type', 'text');
    orcidInput.setAttribute('class', 'form-control');
    orcidInput.setAttribute('id', 'author_orcid_' + numRows);
    orcidInput.setAttribute('name', 'author_orcid_' + numRows);
    orcidInput.setAttribute('pattern', '^$|^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$');
    tableData.appendChild(orcidInput);
    newRow.appendChild(tableData);

    tableData = document.createElement('td');
    tableData.setAttribute('class', 'align-middle');
    const originCourseInput = document.createElement('input');
    originCourseInput.setAttribute('type', 'text');
    originCourseInput.setAttribute('class', 'form-control');
    originCourseInput.setAttribute('id', 'author_origin_course_' + numRows);
    originCourseInput.setAttribute('name', 'author_origin_course_' + numRows);
    tableData.appendChild(originCourseInput);
    newRow.appendChild(tableData);

    tableData = document.createElement('td');
    tableData.setAttribute('class', 'align-middle');
    const removeData = document.createElement('button');
    removeData.setAttribute('type', 'button');
    removeData.setAttribute('class', 'btn btn-secondary mb-2');
    removeData.setAttribute('id', 'remove_author_' + numRows);
    removeData.innerText = 'Remove';
    removeData?.addEventListener('click', () => {
      const rowToRemove = document.querySelector<HTMLTableRowElement>('#author_row_' + numRows);
      rowToRemove?.remove();
      if (questionSettingsForm && saveButton) {
        saveButton.removeAttribute('disabled');
      }
    });
    tableData.appendChild(removeData);
    newRow.appendChild(tableData);

    table?.appendChild(newRow);
  });

  const rows = table?.getElementsByClassName('author-row');
  const numRows = rows?.length ?? 0;
  for (let index = 0; index < numRows; index++) {
    const removeAuthorButton = document.querySelector<HTMLButtonElement>('#remove_author_' + index);
    removeAuthorButton?.addEventListener('click', () => {
      const rowToRemove = document.querySelector<HTMLTableRowElement>('#author_row_' + index);
      rowToRemove?.remove();
      if (questionSettingsForm && saveButton) {
        saveButton.removeAttribute('disabled');
      }
    });
  }

  for (let index = 0; index < numRows; index++) {
    const orcidIDInput = document.querySelector<HTMLInputElement>('#author_orcid_' + index);
    orcidIDInput?.addEventListener('blur', () => {
      const orcidIDValue = orcidIDInput.value;
      const validOrcidID = validateORCID(orcidIDValue);
      const inputClass = 'form-control';
      orcidIDInput.setAttribute(
        'class',
        validOrcidID ? inputClass + ' is-valid' : inputClass + ' is-invalid',
      );
    });
  }
});

function validateORCID(orcid: string): boolean {
  // Empty strings are fine.
  if (orcid == null || orcid === '') {
    return true;
  }
  // Drop any dashes
  const digits = orcid.replaceAll('-', '');

  // Sanity check that should not fail since the ORCID identifier format is baked into the JSON schema
  if (!/^\d{15}[\dX]$/.test(digits)) {
    return false;
  }

  // Calculate and verify checksum
  // (adapted from Java code provided here: https://support.orcid.org/hc/en-us/articles/360006897674-Structure-of-the-ORCID-Identifier)
  let total = 0;
  for (let i = 0; i < 15; i++) {
    total = (total + Number.parseInt(digits[i])) * 2;
  }

  const remainder = total % 11;
  const result = (12 - remainder) % 11;
  const checkDigit = result === 10 ? 'X' : String(result);

  return digits[15] === checkDigit;
}
