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
        .querySelectorAll(`.js-selectable-rubric-item[data-key-binding="${event.key}"]`)
        .forEach((item) => item.dispatchEvent(new MouseEvent('click')));
    }
  });
});

function resetInstructorGradingPanel() {
  $('[data-toggle="tooltip"]').tooltip();

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
    });
    toggle.checked = window.localStorage.manual_grading_score_use === 'percentage';
    toggle.dispatchEvent(new Event('change'));
  });

  // Auto points are disabled by default to avoid confusion, since they are not typically changed by this interface.
  document.querySelector('.js-enable-auto-score-edit').addEventListener('click', function () {
    const form = this.closest('form');
    form.querySelector('.js-auto-score-value-info').style.display = 'none';
    const input = form.querySelector('.js-auto-score-value-input');
    input.classList.remove('d-none');
    input.style.display = '';
    input.querySelector('input').focus();
  });

  document.querySelectorAll('.js-submission-feedback').forEach((input) => {
    input.addEventListener('input', function () {
      // Adjusts the height based on the feedback content. If the feedback changes, the height
      // changes as well. This is done by resetting the height (so the scrollHeight is computed
      // based on the minimum height) and then using the scrollHeight plus padding as the new height.
      this.style.height = '';
      const style = window.getComputedStyle(this);
      this.style.height =
        this.scrollHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 'px';
    });
    input.dispatchEvent(new Event('input'));
  });

  document.querySelectorAll('.js-show-rubric-settings-button').forEach((button) =>
    button.addEventListener('click', function () {
      const type = this.dataset.rubricType;
      $(`.rubric-settings-modal-${type}`).modal('show');
    })
  );

  document
    .querySelectorAll('.js-selectable-rubric-item')
    .forEach((item) => item.addEventListener('change', computePointsFromRubric));
  document
    .querySelectorAll('.js-grading-score-input')
    .forEach((input) => input.addEventListener('input', updatePointsView));

  document.querySelectorAll('.js-adjust-points-enable').forEach((link) =>
    link.addEventListener('click', function () {
      this.style.display = 'none';
      const input = this.closest('.js-adjust-points').querySelector(
        '.js-adjust-points-input-container'
      );
      input.style.display = '';
      input.classList.remove('d-none');
      input.querySelector('input').focus();
    })
  );
  document.querySelectorAll('.js-adjust-points-points').forEach((input) =>
    input.addEventListener('input', function () {
      this.closest('.js-adjust-points').querySelector('.js-adjust-points-percentage').value =
        ($(this).val() * 100) / $(this).data('max-points');
      computePointsFromRubric();
    })
  );
  document.querySelectorAll('.js-adjust-points-percentage').forEach((input) =>
    input.addEventListener('input', function () {
      this.closest('.js-adjust-points').querySelector('.js-adjust-points-points').value =
        ($(this).val() * $(this).data('max-points')) / 100;
      computePointsFromRubric();
    })
  );

  document
    .querySelectorAll('.js-rubric-settings-modal input[name="use_rubrics"]')
    .forEach((checkbox) => {
      checkbox.addEventListener('change', function () {
        // Rubric settings are only visible if rubrics are enabled
        this.closest('.js-rubric-settings-modal').querySelector(
          '.js-rubric-settings-info'
        ).style.display = this.checked ? '' : 'none';
      });
      checkbox.dispatchEvent(new Event('change'));
    });

  document
    .querySelectorAll('.js-rubric-settings-modal input[name="starting_points"]')
    .forEach((input) => {
      input.addEventListener('change', function () {
        // Custom starting points are only visible if starting point is set to custom.
        const modal = this.closest('.js-rubric-settings-modal');
        modal.querySelector('.js-starting-points-custom').style.display =
          modal.querySelector('input[name="starting_points"]:checked').value === 'CUSTOM'
            ? ''
            : 'none';
      });
      input.dispatchEvent(new Event('change'));
    });

  document
    .querySelectorAll('.js-add-rubric-item-button')
    .forEach((button) => button.addEventListener('click', addRubricItemRow));
  document.querySelectorAll('.js-rubric-item-delete').forEach((button) =>
    button.addEventListener('click', function () {
      this.closest('tr').remove();
      updateRubricItemOrderField();
    })
  );

  document.querySelectorAll('.js-rubric-settings-modal form').forEach((form) =>
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Save values in grading rubric so they can be re-applied once the form is re-created.
      const rubricFormData = Array.from(
        new FormData(
          document.querySelector('form[name=instance_question-manual-grade-update-form]')
        ).entries()
      );

      $(this.closest('.modal')).modal('hide');
      fetch(this.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(this)),
      }).then(async (response) => {
        const data = await response.json();
        if (data.gradingPanel) {
          document.querySelector('.js-main-grading-panel').innerHTML = data.gradingPanel;

          // Restore any values that had been set before the settings were configured.
          const newRubricForm = document.querySelector(
            'form[name=instance_question-manual-grade-update-form]'
          );
          newRubricForm.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            input.checked = false;
          });
          rubricFormData.forEach(([item_name, item_value]) => {
            newRubricForm.querySelectorAll(`[name="${item_name}"]`).forEach((input) => {
              if (input.type !== 'checkbox') {
                input.value = item_value;
              } else if (input.value === item_value) {
                input.checked = true;
              }
            });
          });
        }
        if (data.rubricSettingsManual) {
          document.querySelector('.rubric-settings-modal-manual').outerHTML =
            data.rubricSettingsManual;
        }
        if (data.rubricSettingsAuto) {
          document.querySelector('.rubric-settings-modal-auto').outerHTML = data.rubricSettingsAuto;
        }
        resetInstructorGradingPanel();
      });
    })
  );

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
  computePointsFromRubric();
}

function resetRubricItemRowsListeners() {
  document
    .querySelectorAll('.js-rubric-items-table tbody tr')
    .forEach((row) => row.addEventListener('dragover', rowDragOver));
  document
    .querySelectorAll('.js-rubric-item-move-button')
    .forEach((row) => row.addEventListener('dragstart', rowDragStart));
  document
    .querySelectorAll('.js-rubric-item-description-field')
    .forEach((button) => button.addEventListener('click', enableRubricItemDescriptionField));
  document
    .querySelectorAll('.js-rubric-item-move-down-button')
    .forEach((button) => button.addEventListener('click', moveRowDown));
  document
    .querySelectorAll('.js-rubric-item-move-up-button')
    .forEach((button) => button.addEventListener('click', moveRowUp));
}

function updatePointsView() {
  const form = document.querySelector('form[name=instance_question-manual-grade-update-form]');
  const max_auto_points = form.dataset.maxAutoPoints;
  const max_manual_points = form.dataset.maxManualPoints;
  const max_points = form.dataset.maxPoints;

  const auto_points =
    this.name === 'score_auto_percent'
      ? (this.value * max_auto_points) / 100
      : form.querySelector('[name=score_auto_points]').value;
  const manual_points =
    this.name === 'score_manual_percent'
      ? (this.value * max_manual_points) / 100
      : form.querySelector('[name=score_manual_points]').value;
  const points = Math.round(100 * (Number(auto_points) + Number(manual_points))) / 100;
  const auto_perc = Math.round((auto_points * 10000) / (max_auto_points || max_points)) / 100;
  const manual_perc = Math.round((manual_points * 10000) / (max_manual_points || max_points)) / 100;
  const total_perc = Math.round((points * 10000) / max_points) / 100;

  if (this.name !== 'score_auto_points') {
    form.querySelector('[name=score_auto_points]').value = auto_points;
  }
  if (this.name !== 'score_auto_percent') {
    form.querySelector('[name=score_auto_percent]').value = auto_perc;
  }
  if (this.name !== 'score_manual_points') {
    form.querySelector('[name=score_manual_points]').value = manual_points;
  }
  if (this.name !== 'score_manual_percent') {
    form.querySelector('[name=score_manual_percent]').value = manual_perc;
  }

  form.querySelector('.js-value-manual-points').text = manual_points;
  form.querySelector('.js-value-auto-points').text = auto_points;
  form.querySelector('.js-value-total-points').text = points;
  form.querySelector('.js-value-manual-percentage').text = manual_perc;
  form.querySelector('.js-value-auto-percentage').text = auto_perc;
  form.querySelector('.js-value-total-percentage').text = total_perc;
}

function computePointsFromRubric() {
  const manualInput = document.querySelector('#js-manual-score-value-input-points');
  const autoInput = document.querySelector('#js-auto-score-value-input-points');
  const form = manualInput.closest('form');
  let computedPoints = {
    manual:
      (manualInput.dataset.rubricStartingPoints || 0) +
      (parseFloat(form.querySelector('input[name="score_manual_adjust_points"]')?.value) || 0),
    auto:
      (autoInput.dataset.rubricStartingPoints || 0) +
      (parseFloat(form.querySelector('input[name="score_auto_adjust_points"]')?.value) || 0),
  };

  document.querySelectorAll('.js-selectable-rubric-item:checked').forEach((item) => {
    computedPoints[item.dataset.rubricItemType] += parseFloat(item.dataset.rubricItemPoints);
  });

  if (manualInput.dataset.rubricActive) {
    manualInput.value = Math.min(
      Math.max(computedPoints.manual, manualInput.dataset.rubricMinPoints),
      manualInput.dataset.rubricMaxPoints
    );
  }
  if (autoInput.dataset.rubricActive) {
    autoInput.val = Math.min(
      Math.max(computedPoints.auto, autoInput.dataset.rubricMinPoints),
      autoInput.dataset.rubricMaxPoints
    );
  }
  updatePointsView();
}

function enableRubricItemDescriptionField(event) {
  const cell = event.target.closest('label');
  const input = document.createElement('textarea');
  input.classList.add('form-control');
  input.name = cell.dataset.inputName;
  input.text = cell.dataset.currentValue;
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
  console.log(row, row.nextElementSibling);
  row.parentNode.insertBefore(row.nextElementSibling, row);
  updateRubricItemOrderField();
}

function moveRowUp(event) {
  const row = event.target.closest('tr');
  row.parentNode.insertBefore(row.previousElementSibling, row.nextElementSibling);
  updateRubricItemOrderField();
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
  const next_id = parseFloat(table.dataset.nextNewId ?? 0) + 1;
  const points = modal.querySelector('.js-negative-grading')?.checked ? -1 : +1;
  table.dataset.nextNewId = next_id;

  const row = modal
    .querySelector('.js-new-row-rubric-item')
    .content.firstElementChild.cloneNode(true);
  table.querySelector('tbody').appendChild(row);

  row.querySelector('.js-rubric-item-row-order').name = `rubric_item[new${next_id}][order]`;
  row.querySelector('.js-rubric-item-points').name = `rubric_item[new${next_id}][points]`;
  row.querySelector('.js-rubric-item-points').value = points;
  row.querySelector('.js-rubric-item-short-text').name = `rubric_item[new${next_id}][short_text]`;
  row.querySelector(
    '.js-rubric-item-description'
  ).dataset.inputName = `rubric_item[new${next_id}][description]`;
  row.querySelector(
    '.js-rubric-item-staff-instructions'
  ).dataset.inputName = `rubric_item[new${next_id}][staff_instructions]`;

  row.querySelector('.js-rubric-item-points').focus();

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
}
