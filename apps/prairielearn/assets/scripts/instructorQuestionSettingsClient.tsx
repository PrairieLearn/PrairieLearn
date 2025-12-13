import clsx from 'clsx';
import TomSelect from 'tom-select';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { TagBadge } from '../../src/components/TagBadge.js';
import { TopicBadgeHtml } from '../../src/components/TopicBadge.js';
import { type Tag, type Topic } from '../../src/lib/db-types.js';
import {
  isValidAuthorName,
  isValidEmail,
  isValidOrcid,
} from '../../src/lib/instructorQuestionSettingsCommon.js';

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
  let nextAuthorIndex = table?.getElementsByClassName('author-row').length ?? 0;
  addAuthorButton?.addEventListener('click', () => {
    const index = nextAuthorIndex++;
    constructNewRow(index, table, questionSettingsForm, saveButton);
    addRowValidation(index, saveButton);
  });

  const addMeButton = document.querySelector<HTMLButtonElement>('#add-me-button');
  nextAuthorIndex = table?.getElementsByClassName('author-row').length ?? 0;
  const addMeUserName = document.querySelector<HTMLInputElement>('#add-me-name');
  const addMeUserEmail = document.querySelector<HTMLInputElement>('#add-me-email');
  addMeButton?.addEventListener('click', () => {
    const index = nextAuthorIndex++;
    constructNewRow(index, table, questionSettingsForm, saveButton);
    const nameInput = document.querySelector<HTMLInputElement>('#author_name_' + index);
    nameInput?.setAttribute('value', addMeUserName?.value ?? '');
    const emailInput = document.querySelector<HTMLInputElement>('#author_email_' + index);
    emailInput?.setAttribute('value', addMeUserEmail?.value ?? '');
    addMeButton.disabled = true;
    addRowValidation(index, saveButton);
  });

  const rows = table?.getElementsByClassName('author-row');
  const numRows = rows?.length ?? 0;
  const removeAuthorButtons = document.getElementsByClassName('remove_author_button');
  for (const removeAuthorButton of removeAuthorButtons) {
    const removeAuthorButtonRowFinalUnderscore = removeAuthorButton.id.lastIndexOf('_');
    const removeAuthorButtonRowIndex = Number(
      removeAuthorButton.id.slice(removeAuthorButtonRowFinalUnderscore + 1),
    );
    removeAuthorButton.addEventListener('click', () => {
      removeAuthorRowButtonClick(removeAuthorButtonRowIndex, questionSettingsForm, saveButton);
    });
  }

  for (let index = 0; index < numRows; index++) {
    const nameInput = document.querySelector<HTMLInputElement>('#author_name_' + index);
    validateNameInput(index, nameInput, saveButton);
    const orcidIDInput = document.querySelector<HTMLInputElement>('#author_orcid_' + index);
    addORCIDInputListener(index, orcidIDInput, saveButton);
    const emailInput = document.querySelector<HTMLInputElement>('#author_email_' + index);
    validateEmailInput(index, emailInput, saveButton);
    const originCourse = document.querySelector<HTMLInputElement>('#author_origin_course_' + index);
    const originCourseInsert = document.querySelector<HTMLElement>(
      '#author_origin_course_insert_' + index,
    );
    insertSharingCourseName(index, originCourseInsert, originCourse, saveButton);
  }
});

const constructNewRow = (
  index: number,
  table: HTMLElement | null,
  questionSettingsForm: HTMLFormElement | null,
  saveButton: HTMLButtonElement | null,
) => {
  const newRow = document.createElement('tr') as HTMLElement;
  newRow.setAttribute('class', 'author-row');
  newRow.setAttribute('id', 'author_row_' + index);
  const originCourseSharingNameInput = document.querySelector<HTMLInputElement>(
    '#author_origin_course_sharing_name',
  );
  const sharingCourseLink =
    originCourseSharingNameInput != null
      ? '<small id="author_origin_course_insert_' +
        index +
        '" class="text-primary" role="button">Insert current course</small></td>'
      : '';
  const newHTML =
    '<td class="align-middle"><input type="text" class="form-control" id="author_name_' +
    index +
    '" name="author_name_' +
    index +
    '"/></td>' +
    '<td class="align-middle"><input type="text" class="form-control" id="author_email_' +
    index +
    '" name="author_email_' +
    index +
    '"/></td>' +
    '<td class="align-middle"><input type="text" class="form-control" pattern="^$|^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$" id="author_orcid_' +
    index +
    '" name="author_orcid_' +
    index +
    '"/></td>' +
    '<td class="text-center align-middle"><input type="text" class="form-control" placeholder="Sharing name" id="author_origin_course_' +
    index +
    '" name="author_origin_course_' +
    index +
    '"/>' +
    sharingCourseLink +
    '<td class="text-center align-middle align-items-center">' +
    '<i type="button" class="bi bi-trash-fill text-danger align-middle remove_author_button" id="remove_author_' +
    index +
    '"</i>' +
    '</td>';
  newRow.innerHTML = newHTML;
  table?.append(newRow);

  addRowValidation(index, saveButton);

  const removeData = document.querySelector<HTMLElement>('#remove_author_' + index);
  removeData?.addEventListener('click', () => {
    removeAuthorRowButtonClick(index, questionSettingsForm, saveButton);
  });
  const originCourse = document.querySelector<HTMLInputElement>('#author_origin_course_' + index);
  const originCourseInsert = document.querySelector<HTMLElement>(
    '#author_origin_course_insert_' + index,
  );
  insertSharingCourseName(index, originCourseInsert, originCourse, saveButton);
};

const addRowValidation = (index: number, saveButton: HTMLButtonElement | null) => {
  const nameInput = document.querySelector<HTMLInputElement>('#author_name_' + index);
  validateNameInput(index, nameInput, saveButton);
  const orcidIDInput = document.querySelector<HTMLInputElement>('#author_orcid_' + index);
  addORCIDInputListener(index, orcidIDInput, saveButton);
  const emailInput = document.querySelector<HTMLInputElement>('#author_email_' + index);
  validateEmailInput(index, emailInput, saveButton);
  const originCourse = document.querySelector<HTMLInputElement>('#author_origin_course_' + index);
  const originCourseInsert = document.querySelector<HTMLElement>(
    '#author_origin_course_insert_' + index,
  );
  insertSharingCourseName(index, originCourseInsert, originCourse, saveButton);
};

const validateAuthorRowsValid = (index: number) => {
  const nameInput = document.querySelector<HTMLInputElement>('#author_name_' + index)?.value ?? '';
  const orcidIDInput =
    document.querySelector<HTMLInputElement>('#author_orcid_' + index)?.value ?? '';
  const emailInput =
    document.querySelector<HTMLInputElement>('#author_email_' + index)?.value ?? '';
  const originCourse =
    document.querySelector<HTMLInputElement>('#author_origin_course_' + index)?.value ?? '';
  console.log(
    nameInput,
    orcidIDInput,
    emailInput,
    originCourse,
    nameInput != '' && (orcidIDInput != '' || emailInput != '' || originCourse != ''),
  );
  return nameInput != '' && (orcidIDInput != '' || emailInput != '' || originCourse != '');
};

const insertSharingCourseName = (
  index: number,
  originCourseInsertText: HTMLElement | null,
  originCourseInput: HTMLInputElement | null,
  saveButton: HTMLButtonElement | null,
) => {
  const originCourseSharingNameInput = document.querySelector<HTMLInputElement>(
    '#author_origin_course_sharing_name',
  );
  originCourseInsertText?.addEventListener('click', () => {
    if (originCourseInput != null && originCourseSharingNameInput != null) {
      originCourseInput.value = originCourseSharingNameInput.value;
    }
    const rowIsValid = validateAuthorRowsValid(index);
    if (!rowIsValid) {
      saveButton?.setAttribute('disabled', 'true');
    }
    return;
  });
};

const removeAuthorRowButtonClick = (
  index: number,
  questionSettingsForm: HTMLFormElement | null,
  saveButton: HTMLButtonElement | null,
) => {
  const rowToRemove = document.querySelector<HTMLTableRowElement>(
    '#author_row_' + index.toString(),
  );
  rowToRemove?.remove();
  if (questionSettingsForm && saveButton) {
    saveButton.removeAttribute('disabled');
  }
};

const validateNameInput = (
  index: number,
  nameInput: HTMLInputElement | null,
  saveButton: HTMLButtonElement | null,
) => {
  nameInput?.addEventListener('blur', () => {
    const nameValue = nameInput.value;
    const validName = isValidAuthorName(nameValue);
    nameInput.setAttribute(
      'class',
      clsx('form-control', {
        'is-invalid': !validName,
      }),
    );
    const rowIsValid = validateAuthorRowsValid(index);
    if (!rowIsValid || !validName) {
      saveButton?.setAttribute('disabled', 'true');
    }
  });

  return;
};

const validateEmailInput = (
  index: number,
  emailInput: HTMLInputElement | null,
  saveButton: HTMLButtonElement | null,
) => {
  emailInput?.addEventListener('blur', () => {
    const emailValue = emailInput.value;
    const validEmail = isValidEmail(emailValue);
    emailInput.setAttribute(
      'class',
      clsx('form-control', {
        'is-invalid': !validEmail,
      }),
    );
    const rowIsValid = validateAuthorRowsValid(index);
    if (!rowIsValid || !validEmail) {
      saveButton?.setAttribute('disabled', 'true');
    }
  });
  return;
};

function addORCIDInputListener(
  index: number,
  orcidIDInput: HTMLInputElement | null,
  saveButton: HTMLButtonElement | null,
): void {
  orcidIDInput?.addEventListener('blur', () => {
    const orcidIDValue = orcidIDInput.value;
    const validOrcidID = validateORCID(orcidIDValue);
    orcidIDInput.setAttribute(
      'class',
      clsx('form-control', {
        'is-invalid': !validOrcidID,
      }),
    );
    const rowIsValid = validateAuthorRowsValid(index);
    if (!rowIsValid || !validOrcidID) {
      saveButton?.setAttribute('disabled', 'true');
    }
  });
}

function validateORCID(orcid: string): boolean {
  // Empty strings are fine.
  if (orcid === '') {
    return true;
  }
  return isValidOrcid(orcid);
}
