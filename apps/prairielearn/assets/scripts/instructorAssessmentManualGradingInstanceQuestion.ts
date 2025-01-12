import ClipboardJS from 'clipboard';

import { mathjaxTypeset } from './lib/mathjax.js';
declare global {
  interface Window {
    rubricItemRowDragging: HTMLTableRowElement;
  }
}

$(() => {
  resetInstructorGradingPanel();

  document.addEventListener('keypress', (event) => {
    // Ignore holding down the key events
    if (event.repeat) return;
    // Ignore events that target an input element
    if (!(event.target instanceof HTMLElement)) return;

    if (
      !['TEXTAREA', 'SELECT'].includes(event.target.tagName) &&
      event.target instanceof HTMLInputElement &&
      (event.target.tagName !== 'INPUT' ||
        ['radio', 'button', 'submit', 'checkbox'].includes(event.target.type)) &&
      !event.target.isContentEditable
    ) {
      document
        .querySelectorAll(
          `.js-selectable-rubric-item[data-key-binding="${event.key}"]:not(:disabled)`,
        )
        .forEach((item) => item.dispatchEvent(new MouseEvent('click')));
    }
  });
  const modal = document.querySelector('#conflictGradingJobModal');
  if (modal) {
    $(modal)
      .on('shown.bs.modal', function () {
        modal
          .querySelectorAll('.js-submission-feedback')
          .forEach((item) => item.dispatchEvent(new Event('input')));
      })
      .modal('show');
  }
});

function resetInstructorGradingPanel() {
  document.querySelectorAll('.js-rubric-settings-modal').forEach((modal) => {
    const clipboard = new ClipboardJS(modal.querySelectorAll('.js-copy-on-click'), {
      container: modal,
    });
    clipboard.on('success', (e) => {
      e.trigger.animate(
        [
          { backgroundColor: '', color: '', offset: 0 },
          { backgroundColor: '#000', color: '#fff', offset: 0.5 },
          { backgroundColor: '', color: '', offset: 1 },
        ],
        500,
      );
      $(e.trigger)
        .popover({
          content: 'Copied!',
          placement: 'right',
        })
        .popover('show');
      window.setTimeout(function () {
        $(e.trigger).popover('hide');
      }, 1000);
    });
  });

  // The visibility of points or percentage is based on a toggle that is persisted in local storage,
  // so that graders can use the same setting across multiple instance questions as they move
  // through grading.
  document
    .querySelectorAll<HTMLInputElement>('.js-manual-grading-pts-perc-select')
    .forEach((toggle) => {
      toggle.addEventListener('change', function () {
        const use_percentage = this.checked;
        document
          .querySelectorAll<HTMLInputElement>('.js-manual-grading-pts-perc-select')
          .forEach((toggle) => {
            toggle.checked = use_percentage;
          });
        document.querySelectorAll<HTMLElement>('.js-manual-grading-points').forEach((element) => {
          element.style.display = use_percentage ? 'none' : '';
        });
        document
          .querySelectorAll<HTMLElement>('.js-manual-grading-percentage')
          .forEach((element) => {
            element.style.display = use_percentage ? '' : 'none';
          });
        window.localStorage.manual_grading_score_use = use_percentage ? 'percentage' : 'points';
        updatePointsView(null);
      });
      toggle.checked = window.localStorage.manual_grading_score_use === 'percentage';
      toggle.dispatchEvent(new Event('change'));
    });

  // Auto points are disabled by default to avoid confusion, since they are not typically changed by this interface.
  document.querySelectorAll<HTMLElement>('.js-enable-auto-score-edit').forEach((pencil) => {
    pencil.addEventListener('click', function () {
      const form = this.closest('form');
      form?.querySelectorAll<HTMLElement>('.js-auto-score-value-info').forEach((element) => {
        element.style.display = 'none';
      });
      form?.querySelectorAll<HTMLElement>('.js-auto-score-value-input').forEach((input) => {
        input.classList.remove('d-none');
        input.style.display = '';
        input.querySelector('input')?.focus();
      });
    });
  });

  document.querySelectorAll<HTMLTextAreaElement>('.js-submission-feedback').forEach((input) => {
    input.addEventListener('input', () => adjustHeightFromContent(input));
    adjustHeightFromContent(input);
  });

  document
    .querySelectorAll<HTMLButtonElement>('.js-show-rubric-settings-button')
    .forEach((button) =>
      button.addEventListener('click', function () {
        $('.js-rubric-settings-modal').modal('show');
      }),
    );

  document
    .querySelectorAll<HTMLInputElement>('.js-selectable-rubric-item')
    .forEach((item) => item.addEventListener('change', computePointsFromRubric));
  document
    .querySelectorAll<HTMLInputElement>('.js-grading-score-input')
    .forEach((input) => input.addEventListener('input', () => computePointsFromRubric(input)));

  document.querySelectorAll<HTMLButtonElement>('.js-adjust-points-enable').forEach((link) =>
    link.addEventListener('click', function () {
      this.style.display = 'none';
      const input = this.closest('.js-adjust-points')?.querySelector<HTMLElement>(
        '.js-adjust-points-input-container',
      );
      if (!input) return;
      input.style.display = '';
      input.classList.remove('d-none');
      input.querySelector('input')?.focus();
    }),
  );
  document.querySelectorAll<HTMLInputElement>('.js-adjust-points-points').forEach((input) =>
    input.addEventListener('input', function () {
      const adjustPointsPercentageInput = this.closest(
        '.js-adjust-points',
      )?.querySelector<HTMLInputElement>('.js-adjust-points-percentage');
      if (!adjustPointsPercentageInput) return;
      adjustPointsPercentageInput.value = `${(+this.value * 100) / +(this.dataset.maxPoints ?? 0)}`;
      computePointsFromRubric();
    }),
  );
  document.querySelectorAll<HTMLInputElement>('.js-adjust-points-percentage').forEach((input) =>
    input.addEventListener('input', function () {
      const adjustPointsPointsInput = this.closest(
        '.js-adjust-points',
      )?.querySelector<HTMLInputElement>('.js-adjust-points-points');
      if (!adjustPointsPointsInput) return;
      adjustPointsPointsInput.value = `${(+this.value * +(this.dataset.maxPoints ?? 0)) / 100}`;
      computePointsFromRubric();
    }),
  );

  document
    .querySelectorAll<HTMLButtonElement>('.js-add-rubric-item-button')
    .forEach((button) => button.addEventListener('click', addRubricItemRow));

  document.querySelectorAll<HTMLInputElement>('.js-replace-auto-points-input').forEach((input) => {
    input.addEventListener('change', updateSettingsPointValues);
  });
  updateSettingsPointValues();

  document
    .querySelectorAll<HTMLFormElement>('.js-rubric-settings-modal form')
    .forEach((form) => form.addEventListener('submit', submitSettings));

  document.querySelectorAll<HTMLButtonElement>('.js-disable-rubric-button').forEach((button) =>
    button.addEventListener('click', (e) => {
      const form = button.closest('form');
      if (!form) return;
      submitSettings.bind(form)(e, 'false');
    }),
  );

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
  computePointsFromRubric();
}

/**
 * Adjusts the height based on the content. If the content changes, the height
 * changes as well. This is done by resetting the height (so the scrollHeight is
 * computed based on the minimum height) and then using the scrollHeight plus
 * padding as the new height.
 */
function adjustHeightFromContent(element: HTMLElement) {
  element.style.height = '';
  if (element.scrollHeight) {
    const style = window.getComputedStyle(element);
    element.style.height =
      element.scrollHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 'px';
  }
}

function updateSettingsPointValues() {
  const form = document.querySelector<HTMLFormElement>('.js-rubric-settings-modal form');
  if (!form) return;
  const selected = form.querySelector<HTMLInputElement>('.js-replace-auto-points-input:checked');
  const points = Number((selected ?? form).dataset.maxPoints);
  const pointsStr = points === 1 ? '1 point' : `${points} points`;

  form.querySelectorAll<HTMLInputElement>('.js-negative-grading').forEach((input) => {
    input.value = String(points);
  });
  form.querySelectorAll<HTMLElement>('.js-rubric-max-points-info').forEach((node) => {
    node.innerText = pointsStr;
  });
  form.querySelectorAll<HTMLElement>('.js-rubric-max-points-positive').forEach((node) => {
    node.style.display = points ? '' : 'none';
  });
  form.querySelectorAll<HTMLElement>('.js-rubric-max-points-zero').forEach((node) => {
    node.style.display = points ? 'none' : '';
  });
  checkRubricItemTotals();
}

function checkRubricItemTotals() {
  const form = document.querySelector('.js-rubric-settings-modal form');
  if (!form) return;
  const startingPoints = Number(
    form.querySelector<HTMLInputElement>('[name="starting_points"]:checked')?.value ?? 0,
  );
  const [totalPositive, totalNegative] = Array.from(
    form.querySelectorAll<HTMLInputElement>('.js-rubric-item-points'),
  )
    .map((input) => Number(input.value))
    .reduce(
      ([pos, neg], value) => (value > 0 ? [pos + value, neg] : [pos, neg + value]),
      [startingPoints, startingPoints],
    );

  const minPointsInput = form.querySelector<HTMLInputElement>('[name="min_points"]');
  const maxPointsInput = form.querySelector<HTMLInputElement>('[name="max_extra_points"]');
  const jsNegativeGradingInput = form.querySelector<HTMLInputElement>('.js-negative-grading');
  if (!minPointsInput || !maxPointsInput || !jsNegativeGradingInput) {
    throw Error('Missing a required input');
  }

  const minPoints = Number(minPointsInput.value ?? 0);
  const maxPoints = Number(maxPointsInput.value ?? 0) + Number(jsNegativeGradingInput.value ?? 0);
  const settingsPointsWarningPlaceholder = form.querySelector(
    '.js-settings-points-warning-placeholder',
  );
  if (settingsPointsWarningPlaceholder) {
    settingsPointsWarningPlaceholder.innerHTML = '';
  }
  if (totalPositive < maxPoints) {
    addAlert(
      form.querySelector('.js-settings-points-warning-placeholder'),
      `Rubric item points reach at most ${totalPositive} points. ${
        maxPoints - totalPositive
      } left to reach maximum.`,
      ['alert-warning'],
    );
  }

  if (totalNegative > minPoints) {
    addAlert(
      form.querySelector('.js-settings-points-warning-placeholder'),
      `Minimum grade from rubric item penalties is ${totalNegative} points.`,
      ['alert-warning'],
    );
  }
}

function submitSettings(this: HTMLFormElement, e: SubmitEvent, use_rubric: any) {
  e.preventDefault();
  const modal = this.closest('.modal');
  if (!modal) return;
  const gradingForm = document.querySelector<HTMLFormElement>(
    '.js-main-grading-panel form[name=manual-grading-form]',
  );
  if (!gradingForm) return;

  // Save values in grading rubric so they can be re-applied once the form is re-created.
  const rubricFormData = Array.from(new FormData(gradingForm).entries());
  // The CSRF token of the returned panels is not valid for the current form (it uses a
  // different URL), so save the old value to be used in future requests.
  const oldCsrfToken =
    gradingForm.querySelector<HTMLInputElement>('[name=__csrf_token]')?.value ?? '';

  // Clear old alerts
  const settingsErrorAlertPlaceholder = this.querySelector('.js-settings-error-alert-placeholder');
  if (settingsErrorAlertPlaceholder) {
    settingsErrorAlertPlaceholder.innerHTML = '';
  }

  const settingsEntries = Object.fromEntries(
    Array.from(new FormData(this).entries()).map(([key, value]) => [key, value.toString()]),
  );
  const settingsFormData = new URLSearchParams(settingsEntries);
  if (use_rubric != null) {
    settingsFormData.set('use_rubric', use_rubric);
  }

  fetch(this.action, {
    method: 'POST',
    body: settingsFormData,
  })
    .then(async (response) => {
      return await response.json().catch(() => ({ err: `Error: ${response.statusText}` }));
    })
    .catch((err) => ({ err }))
    .then(async (data) => {
      if (data.err) {
        console.error(data);
        return addAlert(this.querySelector('.js-settings-error-alert-placeholder'), data.err);
      }
      $(modal).modal('hide');
      if (data.gradingPanel) {
        const mainGradingPanel = document.querySelector('.js-main-grading-panel');
        if (mainGradingPanel) {
          mainGradingPanel.innerHTML = data.gradingPanel;
        }

        // Restore any values that had been set before the settings were configured.
        const newRubricForm = document.querySelector(
          '.js-main-grading-panel form[name=manual-grading-form]',
        );
        newRubricForm
          ?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
          .forEach((input) => {
            input.checked = false;
          });
        rubricFormData.forEach(([item_name, item_value]) => {
          newRubricForm
            ?.querySelectorAll<HTMLInputElement>(`[name="${item_name}"]`)
            .forEach((input) => {
              if (input.name === 'modified_at') {
                // Do not reset modified_at, as the rubric settings may have changed it
              } else if (input.type !== 'checkbox' && !(item_value instanceof File)) {
                input.value = item_value;
              } else if (input.value === item_value) {
                input.checked = true;
              }
            });
        });
      }
      if (data.rubricSettings) {
        const rubricSettingsModal = document.querySelector('.js-rubric-settings-modal');
        if (rubricSettingsModal) {
          rubricSettingsModal.outerHTML = data.rubricSettings;
        }
      }
      document.querySelectorAll<HTMLInputElement>('input[name=__csrf_token]').forEach((input) => {
        input.value = oldCsrfToken;
      });
      resetInstructorGradingPanel();
      await mathjaxTypeset();
    });
}

function addAlert(placeholder: Element | null, msg: string, classes = ['alert-danger']) {
  if (!placeholder) return;
  const alert = document.createElement('div');
  alert.classList.add('alert', 'alert-dismissible', 'fade', 'show');
  if (classes) {
    alert.classList.add(...classes);
  }
  alert.setAttribute('role', 'alert');
  alert.innerText = msg;
  const closeBtn = document.createElement('button');
  closeBtn.classList.add('close');
  closeBtn.dataset.dismiss = 'alert';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '<span aria-hidden="true">&times;</span>';
  alert.appendChild(closeBtn);
  placeholder.appendChild(alert);
}

function resetRubricItemRowsListeners() {
  document
    .querySelectorAll('.js-rubric-items-table tbody tr')
    .forEach((row) => row.addEventListener('dragover', rowDragOver));
  document
    .querySelectorAll('.js-rubric-item-move-button')
    // @ts-expect-error mismatch between vanilla JS and jQuery
    .forEach((row) => row.addEventListener('dragstart', rowDragStart));
  document
    .querySelectorAll('.js-rubric-item-long-text-field')
    .forEach((button) => button.addEventListener('click', enableRubricItemLongTextField));
  document
    .querySelectorAll('.js-rubric-item-move-down-button')
    .forEach((button) => button.addEventListener('click', moveRowDown));
  document
    .querySelectorAll('.js-rubric-item-move-up-button')
    .forEach((button) => button.addEventListener('click', moveRowUp));
  document
    .querySelectorAll('.js-rubric-item-delete')
    .forEach((button) => button.addEventListener('click', deleteRow));
  document
    .querySelectorAll('.js-rubric-item-points, .js-rubric-item-limits')
    .forEach((input) => input.addEventListener('input', checkRubricItemTotals));
}

function roundPoints(points: number) {
  return Math.round(Number(points) * 100) / 100;
}

function updatePointsView(sourceInput: HTMLInputElement | null) {
  document.querySelectorAll<HTMLFormElement>('form[name=manual-grading-form]').forEach((form) => {
    const max_auto_points = Number(form.dataset.maxAutoPoints);
    const max_manual_points = Number(form.dataset.maxManualPoints);
    const max_points = Number(form.dataset.maxPoints);

    const auto_points =
      roundPoints(
        sourceInput?.classList?.contains('js-auto-score-value-input-percentage')
          ? (+(sourceInput?.value ?? 0) * max_auto_points) / 100
          : +(
              form.querySelector<HTMLInputElement>('.js-auto-score-value-input-points')?.value ?? 0
            ),
      ) || 0;
    const manual_points =
      roundPoints(
        sourceInput?.classList?.contains('js-manual-score-value-input-percentage')
          ? (+(sourceInput?.value ?? 0) * max_manual_points) / 100
          : +(
              form.querySelector<HTMLInputElement>('.js-manual-score-value-input-points')?.value ??
              0
            ),
      ) || 0;
    const points = roundPoints(auto_points + manual_points);
    const auto_perc = roundPoints((auto_points * 100) / (max_auto_points || max_points));
    const manual_perc = roundPoints((manual_points * 100) / (max_manual_points || max_points));
    const total_perc = roundPoints((points * 100) / max_points);

    form
      .querySelectorAll<HTMLInputElement>('.js-auto-score-value-input-points')
      .forEach((input) => input !== sourceInput && (input.value = String(auto_points)));
    form
      .querySelectorAll<HTMLInputElement>('.js-auto-score-value-input-percentage')
      .forEach((input) => input !== sourceInput && (input.value = String(auto_perc)));
    form
      .querySelectorAll<HTMLInputElement>('.js-manual-score-value-input-points')
      .forEach((input) => input !== sourceInput && (input.value = String(manual_points)));
    form
      .querySelectorAll<HTMLInputElement>('.js-manual-score-value-input-percentage')
      .forEach((input) => input !== sourceInput && (input.value = String(manual_perc)));

    form
      .querySelectorAll<HTMLElement>('.js-value-manual-points')
      .forEach((v) => (v.innerText = String(manual_points)));
    form
      .querySelectorAll<HTMLElement>('.js-value-auto-points')
      .forEach((v) => (v.innerText = String(auto_points)));
    form
      .querySelectorAll<HTMLElement>('.js-value-total-points')
      .forEach((v) => (v.innerText = String(points)));
    form
      .querySelectorAll<HTMLElement>('.js-value-manual-percentage')
      .forEach((v) => (v.innerText = String(manual_perc)));
    form
      .querySelectorAll<HTMLElement>('.js-value-auto-percentage')
      .forEach((v) => (v.innerText = String(auto_perc)));
    form
      .querySelectorAll<HTMLElement>('.js-value-total-percentage')
      .forEach((v) => (v.innerText = String(total_perc)));
  });
}

function computePointsFromRubric(sourceInput: HTMLInputElement | null = null, _event?: Event) {
  document.querySelectorAll('form[name=manual-grading-form]').forEach((form) => {
    if (form instanceof HTMLFormElement && form.dataset.rubricActive === 'true') {
      const manualInput = form.querySelector<HTMLInputElement>(
        '.js-manual-score-value-input-points',
      );
      if (!manualInput) return;
      const replaceAutoPoints = form.dataset.rubricReplaceAutoPoints === 'true';
      const startingPoints = Number(form.dataset.rubricStartingPoints ?? 0);
      const itemsSum = Array.from(
        form.querySelectorAll<HTMLInputElement>('.js-selectable-rubric-item:checked'),
      )
        .map((item) => Number(item.dataset.rubricItemPoints))
        .reduce((a, b) => a + b, startingPoints);
      const rubricValue =
        Math.min(
          Math.max(Math.round(itemsSum * 100) / 100, Number(form.dataset.rubricMinPoints)),
          Number(replaceAutoPoints ? form.dataset.maxPoints : form.dataset.maxManualPoints) +
            Number(form.dataset.rubricMaxExtraPoints),
        ) +
        Number(
          form.querySelector<HTMLInputElement>('input[name="score_manual_adjust_points"]')?.value ??
            0,
        );
      const manualPoints =
        rubricValue -
        (replaceAutoPoints
          ? Number(
              form.querySelector<HTMLInputElement>('.js-auto-score-value-input-points')?.value ?? 0,
            )
          : 0);

      manualInput.value = String(manualPoints);
    }
  });
  updatePointsView(sourceInput);
}

function enableRubricItemLongTextField(event: Event) {
  if (!(event.target instanceof HTMLElement)) return;
  const container = event.target.closest('td');
  const label = container?.querySelector('label');
  const button = container?.querySelector('button');
  if (!container || !label || !button) return;
  const input = document.createElement('textarea');
  input.classList.add('form-control');
  input.name = button.dataset.inputName ?? '';
  input.setAttribute('maxlength', String(10000));
  input.textContent = button.dataset.currentValue ?? '';

  container.insertBefore(input, label);
  label.remove();
  button.remove();
  input.focus();
  input.addEventListener('input', () => adjustHeightFromContent(input));
  adjustHeightFromContent(input);
}

function updateRubricItemOrderField() {
  document
    .querySelectorAll<HTMLInputElement>('.js-rubric-item-row-order')
    .forEach((input, index) => {
      input.value = String(index);
    });
}

function moveRowDown(event: Event) {
  if (!(event.target instanceof HTMLElement)) return;
  const row = event.target.closest('tr');
  if (!row || !row.parentNode || !row.nextElementSibling) {
    return;
  }
  row.parentNode.insertBefore(row.nextElementSibling, row);
  updateRubricItemOrderField();
}

function moveRowUp(event: Event) {
  if (!(event.target instanceof HTMLElement)) return;
  const row = event.target.closest('tr');
  if (!row || !row.parentNode || !row.nextElementSibling || !row.previousElementSibling) return;
  row.parentNode.insertBefore(row.previousElementSibling, row.nextElementSibling);
  updateRubricItemOrderField();
}

function deleteRow(event: Event) {
  if (!(event.target instanceof HTMLElement)) return;
  const table = event.target.closest('table');
  event.target.closest('tr')?.remove();
  if (!table?.querySelectorAll('.js-rubric-item-row-order')?.length) {
    table?.querySelector('.js-no-rubric-item-note')?.classList.remove('d-none');
  }
  updateRubricItemOrderField();
  checkRubricItemTotals();
}

function rowDragStart(event: JQuery.TriggeredEvent) {
  if (!(event.target instanceof HTMLElement)) return;
  const closestRow = event.target.closest('tr');
  if (closestRow) {
    window.rubricItemRowDragging = closestRow;
  }

  if (!(event.originalEvent instanceof DragEvent)) return;
  if (event.originalEvent.dataTransfer) {
    event.originalEvent.dataTransfer.effectAllowed = 'move';
  }
}

function rowDragOver(event: Event) {
  if (!(event.target instanceof HTMLElement)) return;
  const row = event.target.closest('tr');
  // Rows in different tables don't count
  if (!row || row.parentNode !== window.rubricItemRowDragging.parentNode) return;
  const rowList = Array.from(row.parentNode?.childNodes ?? []);
  const draggingRowIdx = rowList.indexOf(window.rubricItemRowDragging);
  const targetRowIdx = rowList.indexOf(row);
  event.preventDefault();
  if (targetRowIdx < draggingRowIdx) {
    row.parentNode?.insertBefore(window.rubricItemRowDragging, row);
  } else if (row.nextSibling) {
    row.parentNode?.insertBefore(window.rubricItemRowDragging, row.nextSibling);
  } else {
    row.parentNode?.appendChild(window.rubricItemRowDragging);
  }
  updateRubricItemOrderField();
}

function addRubricItemRow(this: HTMLButtonElement, _: Event) {
  const modal = this.closest('.modal');
  if (!modal) return;
  const table = modal.querySelector<HTMLTableElement>('.js-rubric-items-table');
  if (!table) return;
  const next_id = Number(table.dataset.nextNewId ?? 0) + 1;
  const points = modal.querySelector<HTMLInputElement>('.js-negative-grading')?.checked ? -1 : +1;
  table.dataset.nextNewId = String(next_id);

  // Create a new row based on the template element in the modal
  const templateRow = modal.querySelector<HTMLTemplateElement>('.js-new-row-rubric-item');
  const row = templateRow?.content.firstElementChild?.cloneNode(true);
  if (!row || !(row instanceof HTMLTableRowElement)) return;
  table.querySelector('tbody')?.appendChild(row);

  const rubricItemRowOrder = row.querySelector<HTMLInputElement>('.js-rubric-item-row-order');
  if (rubricItemRowOrder) {
    rubricItemRowOrder.name = `rubric_item[new${next_id}][order]`;
  }
  const rubricItemPoints = row.querySelector<HTMLInputElement>('.js-rubric-item-points');
  if (rubricItemPoints) {
    rubricItemPoints.name = `rubric_item[new${next_id}][points]`;
    rubricItemPoints.value = String(points);
  }
  const rubricItemDescription = row.querySelector<HTMLInputElement>('.js-rubric-item-description');
  if (rubricItemDescription) {
    rubricItemDescription.name = `rubric_item[new${next_id}][description]`;
  }
  const rubricItemExplanation = row.querySelector<HTMLButtonElement>('.js-rubric-item-explanation');
  if (rubricItemExplanation) {
    rubricItemExplanation.dataset.inputName = `rubric_item[new${next_id}][explanation]`;
  }
  const rubricItemGraderNote = row.querySelector<HTMLButtonElement>('.js-rubric-item-grader-note');
  if (rubricItemGraderNote) {
    rubricItemGraderNote.dataset.inputName = `rubric_item[new${next_id}][grader_note]`;
  }
  row
    .querySelectorAll<HTMLInputElement>('.js-rubric-item-always-show')
    .forEach((input) => (input.name = `rubric_item[new${next_id}][always_show_to_students]`));

  row.querySelector<HTMLInputElement>('.js-rubric-item-points')?.focus();

  table.querySelector<HTMLElement>('.js-no-rubric-item-note')?.classList.add('d-none');

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
  checkRubricItemTotals();
}
