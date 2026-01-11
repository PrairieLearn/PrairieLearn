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
  const removeExternalGradingButton = document.querySelector<HTMLButtonElement>(
    '#remove-external-grading-options-button',
  );
  const showWorkspaceOptionsButton = document.querySelector<HTMLButtonElement>(
    '#show-workspace-options-button',
  );
  const removeWorkspaceButton = document.querySelector<HTMLButtonElement>(
    '#remove-workspace-options-button',
  );
  const workspaceOptions = document.querySelector<HTMLDivElement>('#workspace-options');
  const workspaceImageInput = document.querySelector<HTMLInputElement>('#workspace_image');
  const workspacePortInput = document.querySelector<HTMLInputElement>('#workspace_port');
  const workspaceHomeInput = document.querySelector<HTMLInputElement>('#workspace_home');
  const workspaceGradedFilesInput =
    document.querySelector<HTMLInputElement>('#workspace_graded_files');
  const workspaceArgsInput = document.querySelector<HTMLInputElement>('#workspace_args');
  const workspaceEnableNetworkingInput = document.querySelector<HTMLInputElement>(
    '#workspace_enable_networking',
  );
  const workspaceRewriteUrlInput =
    document.querySelector<HTMLInputElement>('#workspace_rewrite_url');
  const workspaceEnvironmentInput =
    document.querySelector<HTMLInputElement>('#workspace_environment');
  const externalGradingOptions = document.querySelector<HTMLDivElement>(
    '#external-grading-options',
  );
  const externalGradingImageInput =
    document.querySelector<HTMLInputElement>('#external_grading_image');
  const externalGradingEnabledInput = document.querySelector<HTMLInputElement>(
    '#external_grading_enabled',
  );
  const externalGradingEntrypointInput = document.querySelector<HTMLInputElement>(
    '#external_grading_entrypoint',
  );
  const externalGradingFilesInput =
    document.querySelector<HTMLInputElement>('#external_grading_files');
  const externalGradingTimeoutInput = document.querySelector<HTMLInputElement>(
    '#external_grading_timeout',
  );
  const externalGradingEnableNetworkingInput = document.querySelector<HTMLInputElement>(
    '#external_grading_enable_networking',
  );
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
    if (removeWorkspaceButton) {
      removeWorkspaceButton.removeAttribute('hidden');
    } else {
      console.error('Remove workspace button not found');
    }
    workspaceOptionsShown = true;
    updateWorkspaceOptionsValidation();
  });
  removeWorkspaceButton?.addEventListener('click', () => {
    workspaceOptions?.setAttribute('hidden', 'true');
    showWorkspaceOptionsButton?.removeAttribute('hidden');
    if (removeWorkspaceButton) {
      removeWorkspaceButton.setAttribute('hidden', 'true');
    }

    if (workspaceImageInput) workspaceImageInput.value = '';
    if (workspacePortInput) workspacePortInput.value = '';
    if (workspaceHomeInput) workspaceHomeInput.value = '';
    if (workspaceGradedFilesInput) workspaceGradedFilesInput.value = '';
    if (workspaceArgsInput) workspaceArgsInput.value = '';
    if (workspaceEnvironmentInput) workspaceEnvironmentInput.value = '{}';

    if (workspaceEnableNetworkingInput) workspaceEnableNetworkingInput.checked = false;
    if (workspaceRewriteUrlInput) workspaceRewriteUrlInput.checked = true;

    workspaceOptionsShown = false;
    updateWorkspaceOptionsValidation();

    if (saveButton) {
      saveButton.removeAttribute('disabled');
    }
  });

  showExternalGradingOptionsButton?.addEventListener('click', () => {
    externalGradingOptions?.removeAttribute('hidden');
    showExternalGradingOptionsButton.setAttribute('hidden', 'true');
    if (removeExternalGradingButton) {
      removeExternalGradingButton.removeAttribute('hidden');
    } else {
      console.error('Remove external grading button not found');
    }
    externalGradingOptionsShown = true;
    updateExternalGradingOptionsValidation();
  });

  removeExternalGradingButton?.addEventListener('click', () => {
    externalGradingOptions?.setAttribute('hidden', 'true');
    showExternalGradingOptionsButton?.removeAttribute('hidden');
    if (removeExternalGradingButton) {
      removeExternalGradingButton.setAttribute('hidden', 'true');
    }

    if (externalGradingImageInput) externalGradingImageInput.value = '';
    if (externalGradingEntrypointInput) externalGradingEntrypointInput.value = '';
    if (externalGradingFilesInput) externalGradingFilesInput.value = '';
    if (externalGradingTimeoutInput) externalGradingTimeoutInput.value = '';
    if (externalGradingEnvironmentInput) externalGradingEnvironmentInput.value = '{}';
    if (externalGradingEnabledInput) externalGradingEnabledInput.checked = false;
    if (externalGradingEnableNetworkingInput) externalGradingEnableNetworkingInput.checked = false;

    externalGradingOptionsShown = false;
    updateExternalGradingOptionsValidation();

    if (saveButton) {
      saveButton.removeAttribute('disabled');
    }
  });

  questionSettingsForm?.addEventListener('submit', (e) => {
    if (!questionSettingsForm.checkValidity()) {
      e.preventDefault();
      questionSettingsForm.reportValidity();
    }
  });
});
