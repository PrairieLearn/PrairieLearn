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

  addInstanceQuestionGroupSelectionDropdownListeners();
});

window.mathjaxTypeset = mathjaxTypeset;

window.resetInstructorGradingPanel = function () {
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

  computePointsFromRubric();
};

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

// function enableRubricItemLongTextField(container) {
//   const label = container.querySelector('label'); // May be null
//   const button = container.querySelector('button');
//   if (!container || !button) return;
//   const input = document.createElement('textarea');
//   input.classList.add('form-control');
//   input.name = button.dataset.inputName;
//   input.setAttribute('maxlength', 10000);
//   input.textContent = button.dataset.currentValue || '';

//   button.before(input);
//   label?.remove();
//   button.remove();
//   input.focus();
//   input.addEventListener('input', () => adjustHeightFromContent(input));
//   adjustHeightFromContent(input);
// }

// function enableRubricItemLongTextFieldOnClick(event) {
//   if (!(event.currentTarget instanceof HTMLElement)) return;
//   const container = event.currentTarget.closest('td');
//   enableRubricItemLongTextField(container);
// }

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

function addInstanceQuestionGroupSelectionDropdownListeners() {
  const { instanceQuestionId, instanceQuestionGroupsExist } = decodeData('instance-question-data');

  if (!instanceQuestionGroupsExist) {
    // Instance question grouping has not been run yet for the assessment question,
    // so no instance question group dropdown is available.
    return;
  }

  const instanceQuestionGroupSelectionDropdown = document.querySelector(
    '#instance-question-group-selection-dropdown',
  );

  // Grade button without the dropdown containing the option to grade the entire submission group.
  const gradeButton = document.querySelector('#grade-button');

  // Grade button with a dropdown containing the option to grade the entire submission group.
  const gradeButtonWithDropdown = document.querySelector('#grade-button-with-options');

  ensureElementsExist({
    instanceQuestionGroupSelectionDropdown,

    gradeButton,
    gradeButtonWithDropdown,
  });

  instanceQuestionGroupSelectionDropdown.addEventListener('click', async (e) => {
    const selectedGroupDropdownItem = e.target.closest('.dropdown-item');

    const {
      id: selectedGroupId,
      name: selectedGroupName,
      description: selectedGroupDescription,
    } = selectedGroupDropdownItem.dataset;

    await fetch(`${instanceQuestionId}/manual_instance_question_group`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        manualInstanceQuestionGroupId: selectedGroupId,
      }),
    });

    const activeDropdownItem = document.querySelector('.dropdown-item.active');
    activeDropdownItem.classList.remove('active');

    selectedGroupDropdownItem.classList.add('active');

    // If a instance question group is selected, show the grade button with a dropdown.
    // Otherwise, show the grade button without a dropdown.
    gradeButton.classList.toggle('d-none', selectedGroupId);
    gradeButtonWithDropdown.classList.toggle('d-none', !selectedGroupId);

    const groupSelectionDropdownSpan = document.querySelector(
      '#instance-question-group-selection-dropdown-span',
    );
    groupSelectionDropdownSpan.innerHTML = selectedGroupName;

    const groupDescriptionTooltip = document.querySelector(
      '#instance-question-group-description-tooltip',
    );

    groupDescriptionTooltip.setAttribute('data-bs-title', selectedGroupDescription);
    groupDescriptionTooltip.setAttribute('aria-label', selectedGroupDescription);

    // Update the tooltip title
    const tooltip = window.bootstrap.Tooltip.getInstance(groupDescriptionTooltip);
    if (tooltip) {
      // Dispose the current tooltip instance
      tooltip.dispose();
      // Re-initialize the tooltip
      new window.bootstrap.Tooltip(groupDescriptionTooltip);
    }
  });
}
