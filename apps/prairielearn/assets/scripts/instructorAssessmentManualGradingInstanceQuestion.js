import ClipboardJS from 'clipboard';

import { mathjaxTypeset } from './lib/mathjax.js';

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
    input.addEventListener('input', () => adjustHeightFromContent(input));
    adjustHeightFromContent(input);
  });

  document.querySelectorAll('.js-show-rubric-settings-button').forEach((button) =>
    button.addEventListener('click', function () {
      $('.js-rubric-settings-modal').modal('show');
    }),
  );

  document
    .querySelectorAll('.js-selectable-rubric-item')
    .forEach((item) => item.addEventListener('change', updatePointsAndItems));
  document
    .querySelectorAll('.js-grading-score-input')
    .forEach((input) => input.addEventListener('input', () => computePointsFromRubric(input)));

  document.querySelectorAll('.js-adjust-points-enable').forEach((link) =>
    link.addEventListener('click', function () {
      this.style.display = 'none';
      const input = this.closest('.js-adjust-points')?.querySelector(
        '.js-adjust-points-input-container',
      );
      if (!input) return;
      input.style.display = '';
      input.classList.remove('d-none');
      input.querySelector('input')?.focus();
    }),
  );
  document.querySelectorAll('.js-adjust-points-points').forEach((input) =>
    input.addEventListener('input', function () {
      const adjustPointsPercentageInput = this.closest('.js-adjust-points')?.querySelector(
        '.js-adjust-points-percentage',
      );
      if (!adjustPointsPercentageInput) return;
      adjustPointsPercentageInput.value = `${(+this.value * 100) / +(this.dataset.maxPoints ?? 0)}`;
      computePointsFromRubric();
    }),
  );
  document.querySelectorAll('.js-adjust-points-percentage').forEach((input) =>
    input.addEventListener('input', function () {
      const adjustPointsPointsInput = this.closest('.js-adjust-points')?.querySelector(
        '.js-adjust-points-points',
      );
      if (!adjustPointsPointsInput) return;
      adjustPointsPointsInput.value = `${(+this.value * +(this.dataset.maxPoints ?? 0)) / 100}`;
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

  document.querySelectorAll('.js-disable-rubric-button').forEach((button) =>
    button.addEventListener('click', (e) => {
      const form = button.closest('form');
      if (!form) return;
      submitSettings.bind(form)(e, 'false');
    }),
  );

  resetRubricItemRowsListeners();
  updateRubricItemOrderAndIndentation();
  recomputeItemData();
  // Partially checked rubric items are technically unchecked, so we need to re-compute their display manually
  document.querySelectorAll('.js-selectable-rubric-item').forEach(updateRubricItemCheckStates);
  computePointsFromRubric();
}

/**
 * Adjusts the height based on the content. If the content changes, the height
 * changes as well. This is done by resetting the height (so the scrollHeight is
 * computed based on the minimum height) and then using the scrollHeight plus
 * padding as the new height.
 * @param {HTMLElement} element
 */
function adjustHeightFromContent(element) {
  element.style.height = '';
  if (element.scrollHeight) {
    const style = window.getComputedStyle(element);
    element.style.height =
      element.scrollHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 'px';
  }
}

function updateSettingsPointValues() {
  const form = document.querySelector('.js-rubric-settings-modal form');
  if (!form) return;
  const selected = form.querySelector('.js-replace-auto-points-input:checked');
  const points = Number((selected ?? form).dataset.maxPoints);
  const pointsStr = points === 1 ? '1 point' : `${points} points`;

  form.querySelectorAll('.js-negative-grading').forEach((input) => {
    input.value = `${points}`;
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
  if (!form) return;
  const startingPoints = Number(form.querySelector('[name="starting_points"]:checked')?.value ?? 0);
  const [totalPositive, totalNegative] = Array.from(
    form.querySelectorAll('.js-rubric-item-points:not(.d-none)'),
  )
    .map((input) => Number(input.value))
    .reduce(
      ([pos, neg], value) => (value > 0 ? [pos + value, neg] : [pos, neg + value]),
      [startingPoints, startingPoints],
    );

  const minPointsInput = form.querySelector('[name="min_points"]');
  const maxPointsInput = form.querySelector('[name="max_extra_points"]');
  const jsNegativeGradingInput = form.querySelector('.js-negative-grading');
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

function submitSettings(e, use_rubric) {
  e.preventDefault();
  const modal = this.closest('.modal');
  const gradingForm = document.querySelector(
    '.js-main-grading-panel form[name=manual-grading-form]',
  );
  if (!gradingForm) return;

  // Save values in grading rubric so they can be re-applied once the form is re-created.
  const rubricFormData = Array.from(new FormData(gradingForm).entries());
  // The CSRF token of the returned panels is not valid for the current form (it uses a
  // different URL), so save the old value to be used in future requests.
  const oldCsrfToken = gradingForm.querySelector('[name=__csrf_token]')?.value ?? '';

  // Clear old alerts
  const settingsErrorAlertPlaceholder = this.querySelector('.js-settings-error-alert-placeholder');
  if (settingsErrorAlertPlaceholder) {
    settingsErrorAlertPlaceholder.innerHTML = '';
  }

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
        newRubricForm?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = false;
        });
        rubricFormData.forEach(([item_name, item_value]) => {
          newRubricForm?.querySelectorAll(`[name="${item_name}"]`).forEach((input) => {
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
      document.querySelectorAll('input[name=__csrf_token]').forEach((input) => {
        input.value = oldCsrfToken;
      });
      resetInstructorGradingPanel();
      await mathjaxTypeset();
    });
}

function addAlert(placeholder, msg, classes = ['alert-danger']) {
  if (!placeholder) return;
  const alert = document.createElement('div');
  alert.classList.add('alert', 'alert-dismissible', 'fade', 'show');
  if (classes) {
    alert.classList.add(...classes);
  }
  alert.setAttribute('role', 'alert');
  alert.innerText = msg;
  const closeBtn = document.createElement('button');
  closeBtn.classList.add('btn-close');
  closeBtn.dataset.bsDismiss = 'alert';
  closeBtn.setAttribute('aria-label', 'Close');
  alert.appendChild(closeBtn);
  placeholder.appendChild(alert);
}

function resetRubricItemRowsListeners() {
  // dragenter fires much less frequently, so it is a better handler for dragging,
  // but dragover still needs to implemented with preventDefault for drops to register
  document
    .querySelectorAll('.js-rubric-items-table tbody tr')
    .forEach((row) => row.addEventListener('dragenter', rowDragEnter));
  document
    .querySelectorAll('.js-rubric-items-table tbody tr')
    .forEach((row) => row.addEventListener('dragover', (e) => e.preventDefault()));
  document
    .querySelectorAll('.js-rubric-item-move-button')
    .forEach((row) => row.addEventListener('dragstart', rowDragStart));
  document
    .querySelectorAll('.js-rubric-item-row')
    .forEach((row) => row.addEventListener('drop', recomputeItemData));
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
    .querySelectorAll('.js-rubric-item-move-in-button')
    .forEach((button) => button.addEventListener('click', indentRow));
  document
    .querySelectorAll('.js-rubric-item-move-out-button')
    .forEach((button) => button.addEventListener('click', unindentRow));
  document
    .querySelectorAll('.js-rubric-item-delete')
    .forEach((button) => button.addEventListener('click', deleteRow));
  document
    .querySelectorAll('.js-rubric-item-points, .js-rubric-item-limits')
    .forEach((input) => input.addEventListener('input', checkRubricItemTotals));
  document
    .querySelectorAll('.js-rubric-item-points, .js-rubric-item-always-show')
    .forEach((input) => input.addEventListener('input', updateRubricItemOrderAndIndentation));
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
          ? (+(sourceInput?.value ?? 0) * max_auto_points) / 100
          : +(form.querySelector('.js-auto-score-value-input-points')?.value ?? 0),
      ) || 0;
    const manual_points =
      roundPoints(
        sourceInput?.classList?.contains('js-manual-score-value-input-percentage')
          ? (+(sourceInput?.value ?? 0) * max_manual_points) / 100
          : +(form.querySelector('.js-manual-score-value-input-points')?.value ?? 0),
      ) || 0;
    const points = roundPoints(auto_points + manual_points);
    const auto_perc = roundPoints((auto_points * 100) / (max_auto_points || max_points));
    const manual_perc = roundPoints((manual_points * 100) / (max_manual_points || max_points));
    const total_perc = roundPoints((points * 100) / max_points);

    form
      .querySelectorAll('.js-auto-score-value-input-points')
      .forEach((input) => input !== sourceInput && (input.value = `${auto_points}`));
    form
      .querySelectorAll('.js-auto-score-value-input-percentage')
      .forEach((input) => input !== sourceInput && (input.value = `${auto_perc}`));
    form
      .querySelectorAll('.js-manual-score-value-input-points')
      .forEach((input) => input !== sourceInput && (input.value = `${manual_points}`));
    form
      .querySelectorAll('.js-manual-score-value-input-percentage')
      .forEach((input) => input !== sourceInput && (input.value = `${manual_perc}`));

    form
      .querySelectorAll('.js-value-manual-points')
      .forEach((v) => (v.innerText = `${manual_points}`));
    form.querySelectorAll('.js-value-auto-points').forEach((v) => (v.innerText = `${auto_points}`));
    form.querySelectorAll('.js-value-total-points').forEach((v) => (v.innerText = `${points}`));
    form
      .querySelectorAll('.js-value-manual-percentage')
      .forEach((v) => (v.innerText = `${manual_perc}`));
    form
      .querySelectorAll('.js-value-auto-percentage')
      .forEach((v) => (v.innerText = `${auto_perc}`));
    form
      .querySelectorAll('.js-value-total-percentage')
      .forEach((v) => (v.innerText = `${total_perc}`));
  });
}

function checkContainedRubricItems(item) {
  document
    .querySelectorAll('.js-selectable-rubric-item[data-parent-item="' + item.value + '"]')
    .forEach((child) => {
      if (child.checked !== item.checked || child.indeterminate) {
        child.checked = item.checked;
        child.indeterminate = false;
        checkContainedRubricItems(child, true);
      }
    });
}

function updateRubricItemCheckStates(item) {
  // Set parent state based on item and siblings (indeterminate if they are not all the same)
  if (item.getAttribute('data-parent-item')) {
    const sameParentItems = document.querySelectorAll(
      '.js-selectable-rubric-item[data-parent-item="' +
        item.getAttribute('data-parent-item') +
        '"]',
    );
    const parentItem = document.querySelector(
      '.js-selectable-rubric-item[value="' + item.getAttribute('data-parent-item') + '"]',
    );
    if (
      Array.from(sameParentItems).every(
        (otherItem) => otherItem.checked === item.checked && !otherItem.indeterminate,
      )
    ) {
      parentItem.indeterminate = false;
      parentItem.checked = item.checked;
    } else {
      parentItem.indeterminate = true;
      parentItem.checked = false;
    }
    updateRubricItemCheckStates(parentItem, false);
  }
}

function updatePointsAndItems(event) {
  checkContainedRubricItems(event.target);
  updateRubricItemCheckStates(event.target);
  computePointsFromRubric(event.target);
}

function computePointsFromRubric(sourceInput = null) {
  document.querySelectorAll('form[name=manual-grading-form]').forEach((form) => {
    if (form instanceof HTMLFormElement && form.dataset.rubricActive === 'true') {
      const manualInput = form.querySelector('.js-manual-score-value-input-points');
      if (!manualInput) return;
      const replaceAutoPoints = form.dataset.rubricReplaceAutoPoints === 'true';
      const startingPoints = Number(form.dataset.rubricStartingPoints ?? 0);
      const itemsSum = Array.from(form.querySelectorAll('.js-selectable-rubric-item:checked'))
        .map((item) => Number(item.dataset.rubricItemPoints))
        .reduce((a, b) => a + b, startingPoints);
      const rubricValue =
        Math.min(
          Math.max(Math.round(itemsSum * 100) / 100, Number(form.dataset.rubricMinPoints)),
          Number(replaceAutoPoints ? form.dataset.maxPoints : form.dataset.maxManualPoints) +
            Number(form.dataset.rubricMaxExtraPoints),
        ) + Number(form.querySelector('input[name="score_manual_adjust_points"]')?.value ?? 0);
      const manualPoints =
        rubricValue -
        (replaceAutoPoints
          ? Number(form.querySelector('.js-auto-score-value-input-points')?.value ?? 0)
          : 0);

      manualInput.value = `${manualPoints}`;
    }
  });
  updatePointsView(sourceInput);
}

function enableRubricItemLongTextField(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const container = event.currentTarget.closest('td');
  const label = container.querySelector('label'); // May be null
  const button = container.querySelector('button');
  if (!container || !button) return;
  const input = document.createElement('textarea');
  input.classList.add('form-control');
  input.name = button.dataset.inputName;
  input.setAttribute('maxlength', 10000);
  input.textContent = button.dataset.currentValue || '';

  container.insertBefore(input, button);
  label?.remove();
  button.remove();
  input.focus();
  input.addEventListener('input', () => adjustHeightFromContent(input));
  adjustHeightFromContent(input);
}

// This function is called after any update to the rubric table, including any intermediate drag state
function updateRubricItemOrderAndIndentation() {
  const rows = document.querySelectorAll('.js-rubric-item-row');

  let parentStack = [];
  rows.forEach((row, index) => {
    // Synchronize order
    row.querySelector('.js-rubric-item-row-order').value = index.toString();
    const itemIndent = row.querySelector('.js-rubric-item-indent');

    // Ensure consistent indentation when items are unindented or moved
    itemIndent.value = Math.min(itemIndent.value, parentStack.length).toString();

    // Update parent stack and this row's parent based on new indentation
    parentStack.splice(itemIndent.value, parentStack.length - itemIndent.value);
    if (parentStack.length > 0) {
      row.setAttribute(
        'data-parent-item',
        parentStack[parentStack.length - 1].querySelector('.js-rubric-item-row-order').value,
      );
    } else {
      row.removeAttribute('data-parent-item');
    }

    // Add this row as potential parent to stack
    parentStack.push(row);

    // Update visual indentation
    row.querySelector('.js-rubric-item-render-indent').style.paddingLeft = itemIndent.value + 'rem';
  });
}

// This function is only called after an item is dropped in its final location
function recomputeItemData() {
  const rows = document.querySelectorAll('.js-rubric-item-row');

  let previousIndent = -1;
  let containsAlwaysShow = {};

  // Recompute in reverse to allow always-show check below
  [...rows].reverse().forEach((row) => {
    const itemIndex = row.querySelector('.js-rubric-item-row-order').value;
    const itemIndent = row.querySelector('.js-rubric-item-indent');
    const itemIndentValue = Number(itemIndent.value);
    const itemPoints = row.querySelector('.js-rubric-item-points');
    const itemAlwaysShow = row.querySelector('.js-rubric-item-always-show');

    // Update aria-owns attribute based on previously computed parent data
    const children = document.querySelectorAll(
      '.js-rubric-item-row[data-parent-item="' + itemIndex + '"]',
    );
    row.setAttribute('aria-owns', [...children].map((i) => i.id).join(' '));

    // Internal items are always immediately followed by a further indented item
    if (itemIndentValue < previousIndent) {
      itemPoints.classList.add('d-none');

      // Internal items must have always-show flag if any child has the flag enabled
      if (containsAlwaysShow[itemIndentValue + 1] && !itemAlwaysShow.checked) {
        itemAlwaysShow.checked = true;
        document.querySelector('.js-settings-always-show-warning-placeholder').innerHTML = '';
        addAlert(
          document.querySelector('.js-settings-always-show-warning-placeholder'),
          'Rubric items that contain items always shown to students are always shown as well. Settings have been automatically updated.',
          ['alert-warning'],
        );
      }

      // Reset always-show flag for next-deeper level so children of this node are not counted again
      containsAlwaysShow[itemIndentValue + 1] = false;
    } else {
      itemPoints.classList.remove('d-none');
    }

    // Update point totals and always-show status for current level
    containsAlwaysShow[itemIndentValue] =
      itemAlwaysShow.checked || containsAlwaysShow[itemIndentValue];
    previousIndent = itemIndentValue;
  });

  checkRubricItemTotals();
}

function moveRowDown(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const row = event.currentTarget.closest('tr');
  if (!row || !row.parentNode || !row.nextElementSibling) {
    return;
  }
  row.parentNode.insertBefore(row.nextElementSibling, row);
  updateRubricItemOrderAndIndentation();
  recomputeItemData();
}

function moveRowUp(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const row = event.currentTarget.closest('tr');
  if (!row || !row.parentNode || !row.nextElementSibling || !row.previousElementSibling) return;
  row.parentNode.insertBefore(row.previousElementSibling, row.nextElementSibling);
  updateRubricItemOrderAndIndentation();
  recomputeItemData();
}

function indentRow(event) {
  const row = event.target.closest('tr');
  const rowList = Array.from(row.parentNode.childNodes);
  const targetRowIdx = rowList.indexOf(row);
  const rowItemIdx = row.querySelector('.js-rubric-item-row-order').value;
  const oldIndent = Number(row.querySelector('.js-rubric-item-indent').value);

  if (rowItemIdx > 0) {
    const parentIndent = Number(
      rowList[targetRowIdx - 1].querySelector('.js-rubric-item-indent').value,
    );

    const indentLevel = Math.max(0, Math.min(parentIndent + 1, oldIndent + 1));
    row.querySelector('.js-rubric-item-indent').value = indentLevel;
  }

  updateRubricItemOrderAndIndentation();
  recomputeItemData();
}

function unindentRow(event) {
  const row = event.target.closest('tr');
  const oldIndent = Number(row.querySelector('.js-rubric-item-indent').value);

  // Assuming that indentation was correct before, we can skip most checks when unindenting
  const indentLevel = Math.max(0, oldIndent - 1);
  row.querySelector('.js-rubric-item-indent').value = indentLevel;

  updateRubricItemOrderAndIndentation();
  recomputeItemData();
}

function deleteRow(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const table = event.target.closest('table');
  const targetRow = event.target.closest('tr');
  const rowList = Array.from(targetRow.parentNode.children);
  const targetRowIdx = rowList.indexOf(targetRow);
  const targetRowIndent = rowList[targetRowIdx].querySelector('.js-rubric-item-indent').value;

  targetRow.remove();

  // Decrease indentation of successors until hitting a row with a lower or equal indentation level
  rowList.some((row, idx) => {
    const indent = row.querySelector('.js-rubric-item-indent');
    if (indent !== null && idx > targetRowIdx) {
      if (indent.value <= targetRowIndent) {
        return true;
      }
      indent.value -= 1;
    }
    return false;
  });

  if (!table?.querySelectorAll('.js-rubric-item-row-order')?.length) {
    table.querySelector('.js-no-rubric-item-note')?.classList.remove('d-none');
  }
  updateRubricItemOrderAndIndentation();
  recomputeItemData();
}

function rowDragStart(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  window.rubricItemRowDragging = event.currentTarget.closest('tr');
  if (event.originalEvent?.dataTransfer) {
    event.originalEvent.dataTransfer.effectAllowed = 'move';
  }
}

function rowDragEnter(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  event.preventDefault();

  const row = event.target.closest('tr');

  // Rows in different tables don't count
  if (!row || row.parent !== window.rubricItemRowDragging.parent) {
    return;
  }

  // Calculate indentation level based on dragging coordinates
  const dragIndent = Math.floor((event.clientX - row.getBoundingClientRect().left - 5) / 18);
  const currentIndent = window.rubricItemRowDragging.querySelector('.js-rubric-item-indent');

  // Skip remaining computation if nothing will be changed to increase performance
  if (row === window.rubricItemRowDragging && dragIndent === currentIndent.value) {
    return;
  }

  const rowList = Array.from(row.parentNode.children);
  const draggingRowIdx = rowList.indexOf(window.rubricItemRowDragging);
  const targetRowIdx = rowList.indexOf(row);
  const targetRowItemIdx = row.querySelector('.js-rubric-item-row-order').value;

  if (targetRowIdx < draggingRowIdx) {
    row.parentNode.insertBefore(window.rubricItemRowDragging, row);
  } else if (row.nextSibling) {
    row.parentNode.insertBefore(window.rubricItemRowDragging, row.nextSibling);
  } else {
    row.parentNode.appendChild(window.rubricItemRowDragging);
  }

  // There must be an item above that can serve as parent to allow indentation
  if (targetRowItemIdx > 0) {
    var parentIndent = Number(
      rowList[targetRowIdx - 1].querySelector('.js-rubric-item-indent').value,
    );

    // Prevent a row from being considered as its own parent in certain drag states
    if (draggingRowIdx === targetRowIdx - 1) {
      parentIndent -= 1;
    }
    currentIndent.value = Math.max(0, Math.min(parentIndent + 1, dragIndent));
  } else {
    currentIndent.value = 0;
  }

  updateRubricItemOrderAndIndentation();
}

function addRubricItemRow() {
  const modal = this.closest('.modal');
  if (!modal) return;
  const table = modal.querySelector('.js-rubric-items-table');
  if (!table) return;
  const next_id = Number(table.dataset.nextNewId ?? 0) + 1;
  const points = modal.querySelector('.js-negative-grading')?.checked ? -1 : +1;
  table.dataset.nextNewId = `${next_id}`;

  // Create a new row based on the template element in the modal
  const templateRow = modal.querySelector('.js-new-row-rubric-item');
  const row = templateRow?.content.firstElementChild?.cloneNode(true);
  if (!row || !(row instanceof HTMLTableRowElement)) return;
  table.querySelector('tbody').appendChild(row);

  const rubricItemRowOrder = row.querySelector('.js-rubric-item-row-order');
  if (rubricItemRowOrder) {
    rubricItemRowOrder.name = `rubric_item[new${next_id}][order]`;
  }
  const rubricItemIndent = row.querySelector('.js-rubric-item-indent');
  if (rubricItemIndent) {
    rubricItemIndent.name = `rubric_item[new${next_id}][indent]`;
  }
  const rubricItemPoints = row.querySelector('.js-rubric-item-points');
  if (rubricItemPoints) {
    rubricItemPoints.name = `rubric_item[new${next_id}][points]`;
    rubricItemPoints.value = points.toString();
  }
  const rubricItemDescription = row.querySelector('.js-rubric-item-description');
  if (rubricItemDescription) {
    rubricItemDescription.name = `rubric_item[new${next_id}][description]`;
  }
  const rubricItemExplanation = row.querySelector('.js-rubric-item-explanation');
  if (rubricItemExplanation) {
    rubricItemExplanation.dataset.inputName = `rubric_item[new${next_id}][explanation]`;
  }
  const rubricItemGraderNote = row.querySelector('.js-rubric-item-grader-note');
  if (rubricItemGraderNote) {
    rubricItemGraderNote.dataset.inputName = `rubric_item[new${next_id}][grader_note]`;
  }
  row
    .querySelectorAll('.js-rubric-item-always-show')
    .forEach((input) => (input.name = `rubric_item[new${next_id}][always_show_to_students]`));

  row.querySelector('.js-rubric-item-points')?.focus();

  table.querySelector('.js-no-rubric-item-note')?.classList.add('d-none');

  resetRubricItemRowsListeners();
  updateRubricItemOrderAndIndentation();
  recomputeItemData();
}
