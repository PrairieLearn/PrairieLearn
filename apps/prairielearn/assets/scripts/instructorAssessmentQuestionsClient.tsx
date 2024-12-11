import { h, render } from 'preact';
import React, { useState } from 'preact/hooks';

import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';

import { histmini } from './lib/histmini.js';

onDocumentReady(() => {
  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));

  function EditModeButtons() {
    const [editMode, setEditMode] = useState(false);
    return (
      <div class="ml-auto">
        {!editMode ? (
          <button class="btn btn-sm btn-light" onClick={() => setEditMode(true)}>
            <i class="fa fa-edit" aria-hidden="true"></i> Edit assessment questions
          </button>
        ) : (
          // <div>edit mode enabled</div>
          <span class="js-edit-mode-buttons">
            <button class="btn btn-sm btn-light js-save-and-sync-button mx-1">
              <i class="fa fa-save" aria-hidden="true"></i> Save and sync
            </button>
            <button class="btn btn-sm btn-light" onClick={() => window.location.reload()}>
              Cancel
            </button>
          </span>
        )}
      </div>
    );
  }

  render(<EditModeButtons />, document.querySelector('.js-edit-mode-buttons') as HTMLElement);
});
