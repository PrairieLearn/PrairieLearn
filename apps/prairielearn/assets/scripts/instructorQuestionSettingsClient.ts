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

  if (!questionSettingsForm || !saveButton) return;
  saveButtonEnabling(questionSettingsForm, saveButton);
});
