import ClipboardJS from 'clipboard';

$(() => {
  resetInstructorGradingPanel();

  document.addEventListener('keypress', (event) => {
    // Ignore holding down the key events
    if (event.repeat) return;
    // Ignore events that target an input element
    if (
      !['TEXTAREA', 'SELECT'].includes(event.target.tagName) &&
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
      .modal({})
      .on('shown.bs.modal', function () {
        modal
          .querySelectorAll('.js-submission-feedback')
          .forEach((item) => item.dispatchEvent(new Event('input')));
      });
  }
});

function resetInstructorGradingPanel() {
  $('[data-toggle="tooltip"]').tooltip();

  document.querySelectorAll('.js-rubric-settings-modal').forEach((modal) => {
    let clipboard = new ClipboardJS(modal.querySelectorAll('.js-copy-on-click'), {
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
  document.querySelectorAll('.js-manual-grading-pts-perc-select').forEach((toggle) => {
    toggle.addEventListener('change', function () {
      const use_percentage = this.checked;
      document.querySelectorAll('.js-manual-grading-pts-perc-select').forEach((toggle) => {
        toggle.checked = use_percentage;
      });
      document.querySelectorAll('.js-manual-grading-points').forEach((element) => {
        element.style.display = use_percentage ? 'none' : '';
      });
      document.querySelectorAll('.js-manual-grading-percentage').forEach((element) => {
        element.style.display = use_percentage ? '' : 'none';
      });
      window.localStorage.manual_grading_score_use = use_percentage ? 'percentage' : 'points';
      updatePointsView(null);
    });
    toggle.checked = window.localStorage.manual_grading_score_use === 'percentage';
    toggle.dispatchEvent(new Event('change'));
  });

  // Auto points are disabled by default to avoid confusion, since they are not typically changed by this interface.
  document.querySelectorAll('.js-enable-auto-score-edit').forEach((pencil) => {
    pencil.addEventListener('click', function () {
      const form = this.closest('form');
      form.querySelectorAll('.js-auto-score-value-info').forEach((element) => {
        element.style.display = 'none';
      });
      form.querySelectorAll('.js-auto-score-value-input').forEach((input) => {
        input.classList.remove('d-none');
        input.style.display = '';
        input.querySelector('input')?.focus();
      });
    });
  });

  document.querySelectorAll('.js-submission-feedback').forEach((input) => {
    input.addEventListener('input', function () {
      // Adjusts the height based on the feedback content. If the feedback changes, the height
      // changes as well. This is done by resetting the height (so the scrollHeight is computed
      // based on the minimum height) and then using the scrollHeight plus padding as the new height.
      this.style.height = '';
      if (this.scrollHeight) {
        const style = window.getComputedStyle(this);
        this.style.height =
          this.scrollHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 'px';
      }
    });
    input.dispatchEvent(new Event('input'));
  });

  document.querySelectorAll('.js-show-rubric-settings-button').forEach((button) =>
    button.addEventListener('click', function () {
      $('.js-rubric-settings-modal').modal('show');
    }),
  );

  document
    .querySelectorAll('.js-selectable-rubric-item')
    .forEach((item) => item.addEventListener('change', computePointsFromRubric));
  document
    .querySelectorAll('.js-grading-score-input')
    .forEach((input) => input.addEventListener('input', () => computePointsFromRubric(input)));

  document.querySelectorAll('.js-adjust-points-enable').forEach((link) =>
    link.addEventListener('click', function () {
      this.style.display = 'none';
      const input = this.closest('.js-adjust-points').querySelector(
        '.js-adjust-points-input-container',
      );
      input.style.display = '';
      input.classList.remove('d-none');
      input.querySelector('input').focus();
    }),
  );
  document.querySelectorAll('.js-adjust-points-points').forEach((input) =>
    input.addEventListener('input', function () {
      this.closest('.js-adjust-points').querySelector('.js-adjust-points-percentage').value =
        (this.value * 100) / this.dataset.maxPoints;
      computePointsFromRubric();
    }),
  );
  document.querySelectorAll('.js-adjust-points-percentage').forEach((input) =>
    input.addEventListener('input', function () {
      this.closest('.js-adjust-points').querySelector('.js-adjust-points-points').value =
        (this.value * this.dataset.maxPoints) / 100;
      computePointsFromRubric();
    }),
  );

  document
    .querySelectorAll('.js-add-rubric-item-button')
    .forEach((button) => button.addEventListener('click', addRubricItemRow));

  document.querySelectorAll('.js-replace-auto-points-input').forEach((input) => {
    input.addEventListener('change', updateSettingsPointValues);
  });
  updateSettingsPointValues();

  document
    .querySelectorAll('.js-rubric-settings-modal form')
    .forEach((form) => form.addEventListener('submit', submitSettings));

  document
    .querySelectorAll('.js-disable-rubric-button')
    .forEach((button) =>
      button.addEventListener('click', (e) =>
        submitSettings.bind(button.closest('form'))(e, 'false'),
      ),
    );

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
  computePointsFromRubric();
}

function updateSettingsPointValues() {
  const form = document.querySelector('.js-rubric-settings-modal form');
  const selected = form.querySelector('.js-replace-auto-points-input:checked');
  const points = Number((selected ?? form).dataset.maxPoints);
  const pointsStr = points === 1 ? '1 point' : `${points} points`;

  form.querySelectorAll('.js-negative-grading').forEach((input) => {
    input.value = points;
  });
  form.querySelectorAll('.js-rubric-max-points-info').forEach((node) => {
    node.innerText = pointsStr;
  });
  form.querySelectorAll('.js-rubric-max-points-positive').forEach((node) => {
    node.style.display = points ? '' : 'none';
  });
  form.querySelectorAll('.js-rubric-max-points-zero').forEach((node) => {
    node.style.display = points ? 'none' : '';
  });
  checkRubricItemTotals();
}

function checkRubricItemTotals() {
  const form = document.querySelector('.js-rubric-settings-modal form');
  const startingPoints = Number(form.querySelector('[name="starting_points"]:checked')?.value ?? 0);
  const [totalPositive, totalNegative] = Array.from(form.querySelectorAll('.js-rubric-item-points'))
    .map((input) => Number(input.value))
    .reduce(
      ([pos, neg], value) => (value > 0 ? [pos + value, neg] : [pos, neg + value]),
      [startingPoints, startingPoints],
    );
  const minPoints = Number(form.querySelector('[name="min_points"]').value);
  const maxPoints =
    Number(form.querySelector('[name="max_extra_points"]').value) +
    Number(form.querySelector('.js-negative-grading').value);
  form.querySelector('.js-settings-points-warning-placeholder').innerHTML = '';

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

function submitSettings(e, use_rubric) {
  e.preventDefault();
  const modal = this.closest('.modal');
  const gradingForm = document.querySelector(
    '.js-main-grading-panel form[name=manual-grading-form]',
  );
  // Save values in grading rubric so they can be re-applied once the form is re-created.
  const rubricFormData = Array.from(new FormData(gradingForm).entries());
  // The CSRF token of the returned panels is not valid for the current form (it uses a
  // different URL), so save the old value to be used in future requests.
  const oldCsrfToken = gradingForm.querySelector('[name=__csrf_token]').value;

  // Clear old alerts
  this.querySelector('.js-settings-error-alert-placeholder').innerHTML = '';

  const settingsFormData = new URLSearchParams(new FormData(this));
  if (use_rubric != null) {
    settingsFormData.set('use_rubric', use_rubric);
  }

  fetch(this.action, {
    method: 'POST',
    body: settingsFormData,
  })
    .catch((err) => ({ err }))
    .then(async (response) => {
      const data = await response.json().catch(() => ({ err: `Error: ${response.statusText}` }));
      if (data.err) {
        console.error(data);
        return addAlert(this.querySelector('.js-settings-error-alert-placeholder'), data.err);
      }
      $(modal).modal('hide');
      if (data.gradingPanel) {
        document.querySelector('.js-main-grading-panel').innerHTML = data.gradingPanel;

        // Restore any values that had been set before the settings were configured.
        const newRubricForm = document.querySelector(
          '.js-main-grading-panel form[name=manual-grading-form]',
        );
        newRubricForm.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = false;
        });
        rubricFormData.forEach(([item_name, item_value]) => {
          newRubricForm.querySelectorAll(`[name="${item_name}"]`).forEach((input) => {
            if (input.name === 'modified_at') {
              // Do not reset modified_at, as the rubric settings may have changed it
            } else if (input.type !== 'checkbox') {
              input.value = item_value;
            } else if (input.value === item_value) {
              input.checked = true;
            }
          });
        });
      }
      if (data.rubricSettings) {
        document.querySelector('.js-rubric-settings-modal').outerHTML = data.rubricSettings;
      }
      document.querySelectorAll('input[name=__csrf_token]').forEach((input) => {
        input.value = oldCsrfToken;
      });
      resetInstructorGradingPanel();
    });
}

function addAlert(placeholder, msg, classes = ['alert-danger']) {
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

function roundPoints(points) {
  return Math.round(Number(points) * 100) / 100;
}

function updatePointsView(sourceInput) {
  document.querySelectorAll('form[name=manual-grading-form]').forEach((form) => {
    const max_auto_points = Number(form.dataset.maxAutoPoints);
    const max_manual_points = Number(form.dataset.maxManualPoints);
    const max_points = Number(form.dataset.maxPoints);

    const auto_points =
      roundPoints(
        sourceInput?.classList?.contains('js-auto-score-value-input-percentage')
          ? (sourceInput?.value * max_auto_points) / 100
          : form.querySelector('.js-auto-score-value-input-points')?.value,
      ) || 0;
    const manual_points =
      roundPoints(
        sourceInput?.classList?.contains('js-manual-score-value-input-percentage')
          ? (sourceInput?.value * max_manual_points) / 100
          : form.querySelector('.js-manual-score-value-input-points')?.value,
      ) || 0;
    const points = roundPoints(auto_points + manual_points);
    const auto_perc = roundPoints((auto_points * 100) / (max_auto_points || max_points));
    const manual_perc = roundPoints((manual_points * 100) / (max_manual_points || max_points));
    const total_perc = roundPoints((points * 100) / max_points);

    form
      .querySelectorAll('.js-auto-score-value-input-points')
      .forEach((input) => input !== sourceInput && (input.value = auto_points));
    form
      .querySelectorAll('.js-auto-score-value-input-percentage')
      .forEach((input) => input !== sourceInput && (input.value = auto_perc));
    form
      .querySelectorAll('.js-manual-score-value-input-points')
      .forEach((input) => input !== sourceInput && (input.value = manual_points));
    form
      .querySelectorAll('.js-manual-score-value-input-percentage')
      .forEach((input) => input !== sourceInput && (input.value = manual_perc));

    form.querySelectorAll('.js-value-manual-points').forEach((v) => (v.innerText = manual_points));
    form.querySelectorAll('.js-value-auto-points').forEach((v) => (v.innerText = auto_points));
    form.querySelectorAll('.js-value-total-points').forEach((v) => (v.innerText = points));
    form
      .querySelectorAll('.js-value-manual-percentage')
      .forEach((v) => (v.innerText = manual_perc));
    form.querySelectorAll('.js-value-auto-percentage').forEach((v) => (v.innerText = auto_perc));
    form.querySelectorAll('.js-value-total-percentage').forEach((v) => (v.innerText = total_perc));
  });
}

function computePointsFromRubric(sourceInput = null) {
  document.querySelectorAll('form[name=manual-grading-form]').forEach((form) => {
    if (form.dataset.rubricActive === 'true') {
      const manualInput = form.querySelector('.js-manual-score-value-input-points');
      const replaceAutoPoints = form.dataset.rubricReplaceAutoPoints === 'true';
      const startingPoints = Number(form.dataset.rubricStartingPoints || 0);
      const itemsSum = Array.from(form.querySelectorAll('.js-selectable-rubric-item:checked'))
        .map((item) => Number(item.dataset.rubricItemPoints))
        .reduce((a, b) => a + b, startingPoints);
      const rubricValue =
        Math.min(
          Math.max(Math.round(itemsSum * 100) / 100, Number(form.dataset.rubricMinPoints)),
          Number(replaceAutoPoints ? form.dataset.maxPoints : form.dataset.maxManualPoints) +
            Number(form.dataset.rubricMaxExtraPoints),
        ) + Number(form.querySelector('input[name="score_manual_adjust_points"]')?.value || 0);
      const manualPoints =
        rubricValue -
        (replaceAutoPoints
          ? Number(form.querySelector('.js-auto-score-value-input-points').value)
          : 0);

      manualInput.value = manualPoints;
    }
  });
  updatePointsView(sourceInput);
}

function enableRubricItemLongTextField(event) {
  const cell = event.target.closest('label');
  const input = document.createElement('textarea');
  input.classList.add('form-control');
  input.name = cell.dataset.inputName;
  input.setAttribute('maxlength', 10000);
  input.innerText = cell.dataset.currentValue || '';
  cell.parentNode.insertBefore(input, cell);
  cell.remove();
  input.focus();
}

function updateRubricItemOrderField() {
  document.querySelectorAll('.js-rubric-item-row-order').forEach((input, index) => {
    input.value = index;
  });
}

function moveRowDown(event) {
  const row = event.target.closest('tr');
  row.parentNode.insertBefore(row.nextElementSibling, row);
  updateRubricItemOrderField();
}

function moveRowUp(event) {
  const row = event.target.closest('tr');
  row.parentNode.insertBefore(row.previousElementSibling, row.nextElementSibling);
  updateRubricItemOrderField();
}

function deleteRow(event) {
  const table = event.target.closest('table');
  event.target.closest('tr').remove();
  if (!table?.querySelectorAll('.js-rubric-item-row-order')?.length) {
    table.querySelector('.js-no-rubric-item-note').classList.remove('d-none');
  }
  updateRubricItemOrderField();
  checkRubricItemTotals();
}

function rowDragStart(event) {
  window.rubricItemRowDragging = event.target.closest('tr');
  if (event.originalEvent?.dataTransfer) {
    event.originalEvent.dataTransfer.effectAllowed = 'move';
  }
}

function rowDragOver(event) {
  const row = event.target.closest('tr');
  // Rows in different tables don't count
  if (!row || row.parent !== window.rubricItemRowDragging.parent) return;
  const rowList = Array.from(row.parentNode.childNodes);
  const draggingRowIdx = rowList.indexOf(window.rubricItemRowDragging);
  const targetRowIdx = rowList.indexOf(row);
  event.preventDefault();
  if (targetRowIdx < draggingRowIdx) {
    row.parentNode.insertBefore(window.rubricItemRowDragging, row);
  } else if (row.nextSibling) {
    row.parentNode.insertBefore(window.rubricItemRowDragging, row.nextSibling);
  } else {
    row.parentNode.appendChild(window.rubricItemRowDragging);
  }
  updateRubricItemOrderField();
}

function addRubricItemRow() {
  const modal = this.closest('.modal');
  const table = modal.querySelector('.js-rubric-items-table');
  const next_id = Number(table.dataset.nextNewId ?? 0) + 1;
  const points = modal.querySelector('.js-negative-grading')?.checked ? -1 : +1;
  table.dataset.nextNewId = next_id;

  // Create a new row based on the template element in the modal
  const row = modal
    .querySelector('.js-new-row-rubric-item')
    .content.firstElementChild.cloneNode(true);
  table.querySelector('tbody').appendChild(row);

  row.querySelector('.js-rubric-item-row-order').name = `rubric_item[new${next_id}][order]`;
  row.querySelector('.js-rubric-item-points').name = `rubric_item[new${next_id}][points]`;
  row.querySelector('.js-rubric-item-points').value = points;
  row.querySelector('.js-rubric-item-description').name = `rubric_item[new${next_id}][description]`;
  row.querySelector('.js-rubric-item-explanation').dataset.inputName =
    `rubric_item[new${next_id}][explanation]`;
  row.querySelector('.js-rubric-item-grader-note').dataset.inputName =
    `rubric_item[new${next_id}][grader_note]`;
  row
    .querySelectorAll('.js-rubric-item-always-show')
    .forEach((input) => (input.name = `rubric_item[new${next_id}][always_show_to_students]`));

  row.querySelector('.js-rubric-item-points').focus();

  table.querySelector('.js-no-rubric-item-note').classList.add('d-none');

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
  checkRubricItemTotals();
}
