/* eslint-disable no-alert */
import ClipboardJS from 'clipboard';
import qs from 'qs';

import { decodeData } from '@prairielearn/browser-utils';

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

function resetRubricImportFormListeners() {
  const importRubricButton = document.querySelector('#import-rubric-button');
  const rubricSettingsForm = document.querySelector('#rubric-settings-form');

  ensureElementsExist({
    importRubricButton,
    rubricSettingsForm,
  });

  importRubricButton.addEventListener('inserted.bs.popover', () => {
    const importRubricSettingsPopoverForm = document.querySelector(
      '#import-rubric-settings-popover-form',
    );

    ensureElementsExist({
      importRubricSettingsPopoverForm,
    });

    importRubricSettingsPopoverForm.addEventListener('submit', async (event) => {
      const { file_upload_max_bytes } = decodeData('rubric-settings-data');

      event.preventDefault();

      const formData = new FormData(event.target);
      const fileData = formData.get('file');

      if (!fileData) {
        alert('Please select a file to import.');
        return;
      }

      if (fileData.size > file_upload_max_bytes) {
        alert(
          `File size exceeds the maximum limit of ${file_upload_max_bytes} bytes. Please choose a smaller file.`,
        );
        return;
      }

      try {
        const fileContent = await fileData.text();
        if (fileContent.trim() === '') {
          return;
        }

        // Clear the existing rubric items in the table
        const table = rubricSettingsForm.querySelector('.table-responsive');
        const tableRows = table?.querySelectorAll('tbody tr:not(.js-no-rubric-item-note)');

        tableRows?.forEach((row) => {
          row.remove();
        });

        let parsedData;
        try {
          parsedData = JSON.parse(fileContent);
        } catch {
          alert('Error parsing JSON file, please check the file format.');
          return;
        }

        const rubricPointsInfo = decodeData('rubric-settings-data');

        // This factor scales the imported rubric point values to ensure that they
        // are correctly aligned with the point values of the recipient question.
        let scaleFactor = 1;

        if (!parsedData.max_auto_points || parsedData.replace_auto_points) {
          // If the rubric does not use auto points, or if it replaces auto points,
          // then the scale factor is based on max_points (the total point gs of the rubric)
          const maxPoints = Number.parseFloat(rubricPointsInfo.max_points) ?? 0;

          if (maxPoints > 0 && parsedData.max_points) {
            scaleFactor = maxPoints / parsedData.max_points;
          }
        } else {
          // If the rubric uses auto points and does not replace them, it
          // applies only to the manual points of the assessment question.
          // Therefore, we base the scale factor on max_manual_points.
          const maxManualPoints = Number.parseFloat(rubricPointsInfo.max_manual_points) ?? 0;

          if (maxManualPoints > 0 && parsedData.max_manual_points) {
            scaleFactor = maxManualPoints / parsedData.max_manual_points;
          }
        }

        const maxExtraPointsField = rubricSettingsForm.querySelector('[name="max_extra_points"]');
        const minPointsField = rubricSettingsForm.querySelector('[name="min_points"]');
        const startingPointsOptions = rubricSettingsForm.querySelectorAll(
          'input[name="starting_points"]',
        );

        ensureElementsExist({
          maxExtraPointsField,
          minPointsField,
          startingPointsOptions,
        });

        maxExtraPointsField.value = roundPoints((parsedData.max_extra_points || 0) * scaleFactor);
        minPointsField.value = roundPoints((parsedData.min_points || 0) * scaleFactor);

        // If starting_points = 0, then the imported rubric uses positive grading.
        const positiveGrading = parsedData.starting_points === 0;

        startingPointsOptions.forEach((option) => {
          // The option with value 0 corresponds to positive grading.
          // When the imported rubric uses positive grading, it should be checked.
          // Otherwise, the other option, which corresponds to negative grading, should be checked.
          option.checked = positiveGrading ? option.value === '0' : option.value !== '0';
        });

        const replaceAutoPointsOptions = rubricSettingsForm.querySelectorAll(
          'input[name="replace_auto_points"]',
        );
        if (replaceAutoPointsOptions) {
          replaceAutoPointsOptions.forEach((option) => {
            option.checked = option.value === parsedData.replace_auto_points.toString();
          });
        }

        const rubricItems = parsedData.rubric_items;
        if (!rubricItems || !Array.isArray(rubricItems)) {
          alert('Invalid rubric data format. Expected rubric_items to be an array.');
          return;
        }

        for (let rubricItem of rubricItems) {
          rubricItem = {
            ...rubricItem,
            points: roundPoints((rubricItem.points ?? 0) * scaleFactor),
          };
          addRubricItemRow(rubricItem);
        }

        updateSettingsPointValues();

        // Close the popover
        window.bootstrap.Popover.getInstance(importRubricButton).hide();
      } catch {
        alert('Error reading file content.');
      }
    });

    importRubricButton.addEventListener(
      'hidden.bs.popover',
      () => {
        document.querySelector('#import-rubric-settings-popover-form')?.reset();
      },
      { once: true },
    );
  });
}

function resetRubricExportFormListeners() {
  const exportRubricButton = document.querySelector('#export-rubric-button');
  const rubricSettingsForm = document.querySelector('#rubric-settings-form');

  ensureElementsExist({
    exportRubricButton,
    rubricSettingsForm,
  });

  exportRubricButton.addEventListener('click', () => {
    const rubricSettingsData = new FormData(rubricSettingsForm);
    const rubricSettings = Object.fromEntries(rubricSettingsData.entries());

    const { max_extra_points, min_points, replace_auto_points, starting_points } = rubricSettings;

    const { max_points, max_auto_points, max_manual_points } = decodeData('rubric-settings-data');

    const rubricData = {
      max_extra_points: Number.parseFloat(max_extra_points),
      min_points: Number.parseFloat(min_points),
      replace_auto_points: replace_auto_points === 'true',
      starting_points: Number.parseFloat(starting_points),
      max_points,
      max_manual_points,
      max_auto_points,
      rubric_items: [],
    };

    // Parse using qs, which allows deep objects to be created based on parameter names
    // e.g., the key `rubric_item[cur1][points]` converts to `rubric_item: { cur1: { points: ... } ... }`
    // Array parsing is disabled, as it has special cases for 22+ items that
    // we don't want to double-handle, so we always receive an object and
    // convert it to an array if necessary
    // (https://github.com/ljharb/qs#parsing-arrays).
    const rubricSettingsParsed = qs.parse(qs.stringify(rubricSettings), { parseArrays: false });

    if (rubricSettingsParsed.rubric_item) {
      const rubricItems = rubricSettingsParsed.rubric_item;

      for (const key of Object.keys(rubricItems)) {
        const value = rubricItems[key];

        rubricData.rubric_items.push({
          always_show_to_students: value.always_show_to_students === 'true',
          /**
           * The description input field is always available, so its value can always be accessed directly.
           */
          description: value.description,
          /**
           * The explanation input field is available only when the user clicks its edit button.
           * When it is not available, we retrieve it from its edit button's data attribute.
           */
          explanation:
            value.explanation ??
            document
              .querySelector(`[data-input-name="rubric_item[${key}][explanation]"]`)
              ?.getAttribute('data-current-value') ??
            '',
          /**
           * The grader note input field is available only when the user clicks its edit button.
           * When it is not available, we retrieve it from its edit button's data attribute.
           */
          grader_note:
            value.grader_note ??
            document
              .querySelector(`[data-input-name="rubric_item[${key}][grader_note]"]`)
              ?.getAttribute('data-current-value') ??
            '',
          order: Number.parseInt(value.order),
          points: Number.parseFloat(value.points),
        });
      }
    }
    rubricData.rubric_items.sort((a, b) => a.order - b.order);

    // Export the rubric settings as a JSON file
    const blob = new Blob([JSON.stringify(rubricData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;

    const { course_short_name, course_instance_short_name, assessment_tid, question_qid } =
      decodeData('rubric-settings-data');

    const exportFileName =
      `${course_short_name}__${course_instance_short_name}__${assessment_tid}__${question_qid}__rubric_settings`.replaceAll(
        /[^a-zA-Z0-9_-]/g,
        '_',
      ) + '.json';

    a.download = exportFileName;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

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
    .forEach((item) => item.addEventListener('change', computePointsFromRubric));
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

  document.querySelectorAll('.js-add-rubric-item-button').forEach((button) =>
    button.addEventListener('click', () => {
      addRubricItemRow();
    }),
  );

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

  resetRubricImportFormListeners();
  resetRubricExportFormListeners();

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
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
      element.scrollHeight +
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom) +
      'px';
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
  const [totalPositive, totalNegative] = Array.from(form.querySelectorAll('.js-rubric-item-points'))
    .map((input) => Number(input.value))
    .reduce(
      ([pos, neg], value) => (value > 0 ? [pos + value, neg] : [pos, neg + value]),
      [startingPoints, startingPoints],
    );

  const minPointsInput = form.querySelector('[name="min_points"]');
  const maxPointsInput = form.querySelector('[name="max_extra_points"]');
  const jsNegativeGradingInput = form.querySelector('.js-negative-grading');
  if (!minPointsInput || !maxPointsInput || !jsNegativeGradingInput) {
    throw new Error('Missing a required input');
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

  // Prevent default form submit behavior, so the modal remains open after the alert is dismissed.
  closeBtn.setAttribute('type', 'button');

  // Make sure Bootstrap sees the close button as an alert dismiss button.
  closeBtn.setAttribute('data-bs-dismiss', 'alert');

  closeBtn.classList.add('btn-close');
  closeBtn.dataset.bsDismiss = 'alert';
  closeBtn.setAttribute('aria-label', 'Close');
  alert.append(closeBtn);
  placeholder.append(alert);
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
    .forEach((button) => button.addEventListener('click', enableRubricItemLongTextFieldOnClick));
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

function enableRubricItemLongTextField(container) {
  const label = container.querySelector('label'); // May be null
  const button = container.querySelector('button');
  if (!container || !button) return;
  const input = document.createElement('textarea');
  input.classList.add('form-control');
  input.name = button.dataset.inputName;
  input.setAttribute('maxlength', 10000);
  input.textContent = button.dataset.currentValue || '';

  button.before(input);
  label?.remove();
  button.remove();
  input.focus();
  input.addEventListener('input', () => adjustHeightFromContent(input));
  adjustHeightFromContent(input);
}

function enableRubricItemLongTextFieldOnClick(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const container = event.currentTarget.closest('td');
  enableRubricItemLongTextField(container);
}

function updateRubricItemOrderField() {
  document.querySelectorAll('.js-rubric-item-row-order').forEach((input, index) => {
    input.value = `${index}`;
  });
}

function moveRowDown(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const row = event.currentTarget.closest('tr');
  if (!row || !row.parentNode || !row.nextElementSibling) {
    return;
  }
  row.parentNode.insertBefore(row.nextElementSibling, row);
  updateRubricItemOrderField();
}

function moveRowUp(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const row = event.currentTarget.closest('tr');
  if (!row || !row.parentNode || !row.nextElementSibling || !row.previousElementSibling) return;
  row.parentNode.insertBefore(row.previousElementSibling, row.nextElementSibling);
  updateRubricItemOrderField();
}

function deleteRow(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const table = event.currentTarget.closest('table');
  event.currentTarget.closest('tr')?.remove();
  if (!table?.querySelectorAll('.js-rubric-item-row-order')?.length) {
    table.querySelector('.js-no-rubric-item-note')?.classList.remove('d-none');
  }
  updateRubricItemOrderField();
  checkRubricItemTotals();
}

function rowDragStart(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  window.rubricItemRowDragging = event.currentTarget.closest('tr');
  if (event.originalEvent?.dataTransfer) {
    event.originalEvent.dataTransfer.effectAllowed = 'move';
  }
}

function rowDragOver(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const row = event.currentTarget.closest('tr');
  // Rows in different tables don't count
  if (!row || row.parent !== window.rubricItemRowDragging.parent) return;
  const rowList = Array.from(row.parentNode?.childNodes ?? []);
  const draggingRowIdx = rowList.indexOf(window.rubricItemRowDragging);
  const targetRowIdx = rowList.indexOf(row);
  event.preventDefault();
  if (targetRowIdx < draggingRowIdx) {
    row.parentNode.insertBefore(window.rubricItemRowDragging, row);
  } else if (row.nextSibling) {
    row.parentNode.insertBefore(window.rubricItemRowDragging, row.nextSibling);
  } else {
    row.parentNode.append(window.rubricItemRowDragging);
  }
  updateRubricItemOrderField();
}

/**
 * Create a new rubric item row with default values or based on a provided rubric item.
 *
 * @param {object | null} rubricItem - The rubric item to add. If null, a new row will be created with default values.
 */
function addRubricItemRow(rubricItem = null) {
  const modal = document.querySelector('#rubric-settings-form');
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
  table.querySelector('tbody').append(row);

  const rubricItemRowOrder = row.querySelector('.js-rubric-item-row-order');
  const rubricItemPoints = row.querySelector('.js-rubric-item-points');
  const rubricItemDescription = row.querySelector('.js-rubric-item-description');
  const rubricItemExplanation = row.querySelector('.js-rubric-item-explanation');
  const rubricItemGraderNote = row.querySelector('.js-rubric-item-grader-note');

  ensureElementsExist({
    rubricItemRowOrder,
    rubricItemPoints,
    rubricItemDescription,
    rubricItemExplanation,
    rubricItemGraderNote,
  });

  rubricItemRowOrder.name = `rubric_item[new${next_id}][order]`;
  if (rubricItem) {
    rubricItemRowOrder.value = `${rubricItem.order}`;
  }

  rubricItemPoints.name = `rubric_item[new${next_id}][points]`;
  rubricItemPoints.value = `${rubricItem?.points ?? points}`;

  rubricItemDescription.name = `rubric_item[new${next_id}][description]`;
  if (rubricItem) {
    rubricItemDescription.value = `${rubricItem.description}`;
  }

  rubricItemExplanation.dataset.inputName = `rubric_item[new${next_id}][explanation]`;
  if (rubricItem) {
    rubricItemExplanation.setAttribute('data-current-value', rubricItem.explanation ?? '');
    if (rubricItem.explanation) {
      const label = document.createElement('label');
      label.setAttribute('for', `rubric-item-explanation-button-${next_id}`);
      label.setAttribute('style', 'white-space: pre-wrap;');
      label.textContent = rubricItem.explanation;

      rubricItemExplanation.parentElement.insertBefore(label, rubricItemExplanation);

      // Enabled so that the updated field can be saved
      enableRubricItemLongTextField(rubricItemExplanation.parentElement);
    }
  }

  rubricItemGraderNote.dataset.inputName = `rubric_item[new${next_id}][grader_note]`;
  if (rubricItem) {
    rubricItemGraderNote.setAttribute('data-current-value', rubricItem.grader_note ?? '');
    if (rubricItem.grader_note) {
      const label = document.createElement('label');
      label.setAttribute('for', `rubric-item-grader-note-button-${next_id}`);
      label.setAttribute('style', 'white-space: pre-wrap;');
      label.textContent = rubricItem.grader_note;

      rubricItemGraderNote.parentElement.insertBefore(label, rubricItemGraderNote);

      // Enabled so that the updated field can be saved
      enableRubricItemLongTextField(rubricItemGraderNote.parentElement);
    }
  }

  row.querySelectorAll('.js-rubric-item-always-show').forEach((input) => {
    input.name = `rubric_item[new${next_id}][always_show_to_students]`;
    if (rubricItem) {
      input.checked = rubricItem.always_show_to_students.toString() === input.value;
    }
  });

  row.querySelector('.js-rubric-item-points')?.focus();

  table.querySelector('.js-no-rubric-item-note')?.classList.add('d-none');

  resetRubricItemRowsListeners();
  updateRubricItemOrderField();
  checkRubricItemTotals();
}

/**
 * Determines if the provided elements exist in the DOM. Throws an error if any element is missing.
 *
 * @param {object} elements - An object of elements, with keys as element names and values as the elements themselves.
 */
function ensureElementsExist(elements) {
  for (const elementName in elements) {
    if (!elements[elementName]) {
      throw new Error(`Element ${elementName} is required but not found in the DOM.`);
    }
  }
}
