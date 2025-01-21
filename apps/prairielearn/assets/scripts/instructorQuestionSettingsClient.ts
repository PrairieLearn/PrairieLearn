import TomSelect from 'tom-select';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import './lib/changeIdButton.js';
import { TagBadge } from '../../src/components/TagBadge.html.js';
import { TopicBadge } from '../../src/components/TopicBadge.html.js';
import { type Topic, type Tag } from '../../src/lib/db-types.js';

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
    plugins: ['dropdown_input', 'no_backspace_delete'],
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

  new TomSelect('#tags', {
    valueField: 'name',
    searchField: ['name', 'description'],
    plugins: ['dropdown_input', 'remove_button'],
    render: {
      option(data: Tag) {
        return html`
          <div>
            ${TagBadge(data)}
            <div>
              <small class="text-muted">${data.description}</small>
            </div>
          </div>
        `.toString();
      },
      item(data: Tag) {
        return html`<span class="badge color-${data.color} mr-1">${data.name}</span>`.toString();
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
