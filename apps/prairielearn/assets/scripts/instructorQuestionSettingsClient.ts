import TomSelect from 'tom-select';

import { onDocumentReady } from '@prairielearn/browser-utils';

import './lib/changeIdButton.js';
import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

interface TopicData {
  name: string;
  description: string;
  color: string;
}

onDocumentReady(() => {
  const qidField = document.querySelector('input[name="qid"]') as HTMLInputElement;
  const otherQids = qidField.dataset.otherValues?.split(',') ?? [];
  const questionSettingsForm = document.querySelector<HTMLFormElement>(
    'form[name="edit-question-settings-form"]',
  );
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');

  new TomSelect('#topic', {
    valueField: 'name',
    searchField: ['name'],
    closeAfterSelect: true,
    items: [(document.querySelector('#topic') as HTMLSelectElement).dataset.selectedTopic],
    plugins: ['dropdown_input'],
    maxItems: 1,
    placeholder: 'Select a topic',
    render: {
      option(data: TopicData, escape: (input: string) => string) {
        return (
          '<div>' +
          '<span class="badge justify-content-start color-' +
          escape(data.color) +
          '">' +
          escape(data.name) +
          '</span>' +
          '<div class="w-100 d-flex">' +
          '<small class="text-muted justify-content-start text-start">' +
          escape(data.description) +
          '</small>' +
          '</div>' +
          '</div>'
        );
      },
      item(data: TopicData, escape: (input: string) => string) {
        return (
          '<div class="w-100 d-flex justify-content-between align-items-center">' +
          '<div class="btn btn-ghost badge color-' +
          escape(data.color) +
          '">' +
          escape(data.name) +
          '</div>' +
          '<i class="fas fa-angle-down mx-2"></i>' +
          '</div>'
        );
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
