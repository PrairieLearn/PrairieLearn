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
  const showWorkspaceOptionsButton = document.querySelector<HTMLButtonElement>(
    '#show-workspace-options-button',
  );
  const workspaceOptions = document.querySelector<HTMLDivElement>('#workspace-options');
  const workspaceImageInput = document.querySelector<HTMLInputElement>('#workspace_image');
  const workspacePortInput = document.querySelector<HTMLInputElement>('#workspace_port');
  const workspaceHomeInput = document.querySelector<HTMLInputElement>('#workspace_home');
  const workspaceEnvironmentInput =
    document.querySelector<HTMLInputElement>('#workspace_environment');

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
    if ((e.target as HTMLInputElement).value === '') {
      workspaceEnvironmentInput?.setCustomValidity('');
      return;
    }
    try {
      const value = JSON.parse((e.target as HTMLInputElement).value);
      if (typeof value !== 'object' || Array.isArray(value)) {
        workspaceEnvironmentInput?.setCustomValidity('Invalid JSON object format');
      } else {
        workspaceEnvironmentInput?.setCustomValidity('');
      }
      return;
    } catch {
      workspaceEnvironmentInput?.setCustomValidity('Invalid JSON object format');
    }
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

  questionSettingsForm?.addEventListener('submit', (e) => {
    if (!questionSettingsForm.checkValidity()) {
      e.preventDefault();
      questionSettingsForm.reportValidity();
    }
  });
});
