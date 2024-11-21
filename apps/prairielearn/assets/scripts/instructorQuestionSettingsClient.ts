import TomSelect from 'tom-select';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import './lib/changeIdButton.js';
import { TopicBadge } from '../../src/components/TopicBadge.html.js';
import { type Topic } from '../../src/lib/db-types.js';

import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

onDocumentReady(() => {
  const qidField = document.querySelector('input[name="qid"]') as HTMLInputElement;
  const otherQids = qidField.dataset.otherValues?.split(',') ?? [];
  const questionSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-question-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');

  new TomSelect('#topic', {
    valueField: 'name',
    searchField: ['name', 'description'],
    closeAfterSelect: true,
    plugins: ['dropdown_input'],
    maxItems: 1,
    render: {
      option(data: Topic) {
        return html`
          <div>
            ${TopicBadge(data)}
            <div>
              <small class="text-muted">${data.description}</small>
            </div>
          </div>
        `.toString();
      },
      item(data: Topic) {
        return TopicBadge(data).toString();
      },
    },
  });

  function validateId() {
    const newValue = qidField.value;

    if (otherQids.includes(newValue) && newValue !== qidField.defaultValue) {
      qidField.setCustomValidity('This ID is already in use');
    } else {
      qidField.setCustomValidity('');
    }

    qidField.reportValidity();
  }

  qidField.addEventListener('input', validateId);
  qidField.addEventListener('change', validateId);

  if (!questionSettingsForm || !saveButton) return;
  saveButtonEnabling(questionSettingsForm, saveButton);
});
