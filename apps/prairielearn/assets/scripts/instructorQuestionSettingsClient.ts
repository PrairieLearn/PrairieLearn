import TomSelect from 'tom-select';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import './lib/changeIdButton.js';
import { TagBadge } from '../../src/components/TagBadge.html.js';
import { TopicBadge } from '../../src/components/TopicBadge.html.js';
import { type Tag, type Topic } from '../../src/lib/db-types.js';

import { saveButtonEnabling } from './lib/saveButtonEnabling.js';
import { validateId } from './lib/validateId.js';

onDocumentReady(() => {
  const qidField = document.querySelector('input[name="qid"]') as HTMLInputElement;
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
  const workspaceEnableNetworkingCheckbox = document.querySelector<HTMLInputElement>(
    '#workspace_enable_networking',
  );
  const workspaceRewriteUrlCheckbox =
    document.querySelector<HTMLInputElement>('#workspace_rewrite_url');
  const externalGradingOptions = document.querySelector<HTMLDivElement>(
    '#external-grading-options',
  );
  const externalGradingEnabledCheckbox = document.querySelector<HTMLInputElement>(
    '#external_grading_enabled',
  );
  const externalGradingImageInput =
    document.querySelector<HTMLInputElement>('#external_grading_image');
  const externalGradingEntrypointInput = document.querySelector<HTMLInputElement>(
    '#external_grading_entrypoint',
  );
  const externalGradingFilesInput =
    document.querySelector<HTMLInputElement>('#external_grading_files');
  const externalGradingTimeoutInput = document.querySelector<HTMLInputElement>(
    '#external_grading_timeout',
  );
  const externalGradingEnableNetworkingCheckbox = document.querySelector<HTMLInputElement>(
    '#external_grading_enable_networking',
  );
  const externalGradingEnvironmentInput = document.querySelector<HTMLInputElement>(
    '#external_grading_environment',
  );

  function validateQuestionOptions() {
    if (
      externalGradingEnabledCheckbox?.checked ||
      externalGradingImageInput?.value ||
      externalGradingEntrypointInput?.value ||
      externalGradingFilesInput?.value ||
      externalGradingTimeoutInput?.value ||
      (externalGradingEnvironmentInput?.value !== '{}' &&
        externalGradingEnvironmentInput?.value !== '') ||
      externalGradingEnableNetworkingCheckbox?.checked
    ) {
      externalGradingImageInput?.setAttribute('required', 'true');
    } else {
      externalGradingImageInput?.removeAttribute('required');
    }
  }

  let workspaceOptionsShown = showWorkspaceOptionsButton?.getAttribute('hidden') === 'true';

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
      return;
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
              ${TopicBadge(data)}
              <div>
                <small>${data.description}</small>
              </div>
            </div>
          `.toString();
        },
        item(data: Topic) {
          return TopicBadge(data).toString();
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
              ${TagBadge(data)}
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
  showWorkspaceOptionsButton?.addEventListener('click', () => {
    workspaceOptions?.removeAttribute('hidden');
    showWorkspaceOptionsButton.setAttribute('hidden', 'true');
    workspaceOptionsShown = true;
    updateWorkspaceOptionsValidation();
  });
  showExternalGradingOptionsButton?.addEventListener('click', () => {
    externalGradingOptions?.removeAttribute('hidden');
    showExternalGradingOptionsButton.setAttribute('hidden', 'true');
  });

  questionSettingsForm?.addEventListener('submit', (e) => {
    validateQuestionOptions();
    if (!questionSettingsForm.checkValidity()) {
      e.preventDefault();
      questionSettingsForm.reportValidity();
    }
  });
});
