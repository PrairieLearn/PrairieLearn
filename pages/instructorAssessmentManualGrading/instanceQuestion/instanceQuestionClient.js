/* eslint-env browser,jquery */
/* global assessment_question_max_points, assessment_question_max_manual_points, assessment_question_max_auto_points, Cookies */

$(() => {
  resetInstructorGradingPanel();

  $(document).keypress((event) => {
    // Ignore holding down the key events
    if (event.repeat) return;
    //event.target.setAttribute('oninput', 'return;');
    //Ignore events that target an input element
    if (
      !$(event.target).is(':input:not(:radio):not(:button):not(:checkbox)') &&
      !event.target.isContentEditable
    ) {
      $(`.js-selectable-rubric-item[data-key-binding="${event.key}"]`).click();
    }
  });
});

function resetInstructorGradingPanel() {
  $('[data-toggle="tooltip"]').tooltip();

  $('.js-manual-grading-pts-perc-select')
    .change(function () {
      const use_percentage = this.checked;
      $('.js-manual-grading-pts-perc-select').prop('checked', use_percentage);
      $('.js-manual-grading-points').toggle(!use_percentage);
      $('.js-manual-grading-percentage').toggle(use_percentage);
      Cookies.set('manual_grading_score_use', use_percentage ? 'percentage' : 'points');
    })
    .prop('checked', Cookies.get('manual_grading_score_use') === 'percentage')
    .first()
    .change();

  $('.js-enable-auto-score-edit').click(function () {
    const form = $(this).parents('form');
    form.find('.js-auto-score-value-info').hide();
    form
      .find('.js-auto-score-value-input')
      .removeClass('d-none')
      .show()
      .find('input:visible:first')
      .focus();
  });

  $('.js-show-rubric-settings-button').click(function () {
    console.log('settings button', this);
    const type = $(this).data('rubric-type');
    $(`.rubric-settings-modal-${type}`).modal('show');
  });

  $('.js-grading-score-input').on('input', function () {
    const form = $(this).parents('form');
    const auto_points =
      this.name === 'score_auto_percent'
        ? (this.value * assessment_question_max_auto_points) / 100
        : form.find('[name=score_auto_points]').val();
    const manual_points =
      this.name === 'score_manual_percent'
        ? (this.value * assessment_question_max_manual_points) / 100
        : form.find('[name=score_manual_points]').val();
    const points = Number(auto_points) + Number(manual_points);

    form.find('[name=score_auto_points]').not(this).val(auto_points);
    form
      .find('[name=score_auto_percent]')
      .not(this)
      .val(
        (auto_points * 100) /
          (assessment_question_max_auto_points || assessment_question_max_points)
      );
    form.find('[name=score_manual_points]').not(this).val(manual_points);
    form
      .find('[name=score_manual_percent]')
      .not(this)
      .val(
        (manual_points * 100) /
          (assessment_question_max_manual_points || assessment_question_max_points)
      );
    form.find('.js-value-total-points').text(Math.round(points * 100) / 100);
    form
      .find('.js-value-total-percentage')
      .text(Math.round((points * 10000) / assessment_question_max_points) / 100);
  });

  $('.js-rubric-settings-modal input[name="use_rubrics"]')
    .change(function () {
      $(this)
        .parents('.js-rubric-settings-modal')
        .find('.js-rubric-settings-info')
        .toggle($(this).is(':checked'));
    })
    .change();

  $('.js-rubric-settings-modal input[name="starting_points"]')
    .change(function () {
      $(this)
        .parents('.js-rubric-settings-modal')
        .find('.js-starting-points-custom')
        .toggle(
          $(this)
            .parents('.js-rubric-settings-modal')
            .find('input[name="starting_points"]:checked')
            .val() === 'CUSTOM'
        );
    })
    .change();

  $('.js-rubric-settings-modal form').submit(function (e) {
    e.preventDefault();
    // TODO Save and restore current rubric and feedback
    $(this).parents('.modal:first').modal('hide');
    $.post(
      $(this).attr('action'),
      $(this).serialize(),
      function (data) {
        if (data.gradingPanel) {
          $('.js-main-grading-panel').html(data.gradingPanel);
        }
        if (data.rubricSettingsManual) {
          const content = $(data.rubricSettingsManual).html();
          $('.rubric-settings-modal-manual').html(content);
        }
        if (data.rubricSettingsAuto) {
          const content = $(data.rubricSettingsAuto).html();
          $('.rubric-settings-modal-auto').html(content);
        }
        resetInstructorGradingPanel();
      },
      'json'
    );
  });

  $('.js-rubric-settings-modal .js-add-rubric-item-button').click(addRubricItemRow);

  updateRubricItemOrderField();
}

function enableRubricItemDescriptionField(event) {
  const cell = $(event.target).parents('label:first');
  const data = cell.data();
  const input = $('<textarea class="form-control">')
    .attr('name', data.inputName)
    .text(data.currentValue);
  cell.after(input).remove();
  input.focus();
}

function updateRubricItemOrderField() {
  $('.js-rubric-item-row-order').val((index) => index);
}

function moveRowDown(event) {
  const row = $(event.target).parents('tr:first');
  row.insertAfter(row.next());
  updateRubricItemOrderField();
}

function moveRowUp(event) {
  const row = $(event.target).parents('tr:first');
  row.insertBefore(row.prev());
  updateRubricItemOrderField();
}

function rowDragStart(event) {
  window.rubricItemRowDragging = $(event.target).parents('tr:first');
  if (event.originalEvent?.dataTransfer) {
    event.originalEvent.dataTransfer.effectAllowed = 'move';
  }
}

function rowDragOver(event) {
  const row = $(event.target).parents('tr:first');
  const rowList = window.rubricItemRowDragging.parents('tbody:first').find('tr');
  const draggingRowIdx = rowList.index(window.rubricItemRowDragging);
  const targetRowIdx = rowList.index(row);
  if (targetRowIdx === -1 || draggingRowIdx === -1) return;
  event.preventDefault();
  if (targetRowIdx > draggingRowIdx) row.after(window.rubricItemRowDragging);
  else row.before(window.rubricItemRowDragging);
  updateRubricItemOrderField();
}

function addRubricItemRow() {
  const modal = $(this).parents('.modal:first');
  const table = modal.find('.js-rubric-items-table');
  const next_id = (table.data('next-new-id') ?? 0) + 1;
  const points = modal.find('.js-negative-grading').prop('checked') ? -1 : +1;
  table.data('next-new-id', next_id);

  $('<tr>')
    .on('dragover', rowDragOver)
    .on('dragenter', rowDragOver)
    .append(
      $('<td>')
        .append(
          $('<input type="hidden" class="js-rubric-item-row-order">').attr(
            'name',
            `rubric_item[new${next_id}][order]`
          )
        )
        .append(
          $('<button type="button" class="btn btn-sm">')
            .attr('draggable', 'true')
            .append('<i class="fas fa-arrows-up-down">')
            .on('dragstart', rowDragStart)
        )
        .append(
          $('<button type="button" class="btn btn-sm sr-only">')
            .text('Move down')
            .click(moveRowDown)
        )
        .append(
          $('<button type="button" class="btn btn-sm sr-only">').text('Move up').click(moveRowUp)
        )
    )
    .append(
      $('<td style="max-width: 4rem">').append(
        $('<input type="number" class="form-control" step="any">')
          .attr('name', `rubric_item[new${next_id}][points]`)
          .val(points)
      )
    )
    .append(
      $('<td>').append(
        $('<input type="text" class="form-control">').attr(
          'name',
          `rubric_item[new${next_id}][short_text]`
        )
      )
    )
    .append(
      $('<td>').append(
        $('<label>')
          .data('input-name', `rubric_item[new${next_id}][description]`)
          .append(
            $('<button type="button" class="btn btn-sm">')
              .click(enableRubricItemDescriptionField)
              .append('<i class="fas fa-pencil"></i>')
          )
      )
    )
    .append(
      $('<td>').append(
        $('<label>')
          .data('input-name', `rubric_item[new${next_id}][staff_instructions]`)
          .append(
            $('<button type="button" class="btn btn-sm">')
              .click(enableRubricItemDescriptionField)
              .append('<i class="fas fa-pencil"></i>')
          )
      )
    )
    .appendTo(table)
    .find('input[type="text"]:first')
    .focus();

  updateRubricItemOrderField();
}
