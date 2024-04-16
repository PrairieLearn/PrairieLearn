import { onDocumentReady } from '@prairielearn/browser-utils';
import { BootstrapTableOptions } from 'bootstrap-table';

declare global {
  interface Window {
    refreshTable: () => void;
    popoverSubmitViaAjax: (e: any, popover: JQuery) => void;
    timeLimitEditPopoverContent: () => JQuery<HTMLElement>;
    scorebarFormatter: (score: number, row: any) => string;
    listFormatter: (list: string[], row: any) => string;
    uniqueListFormatter: (list: string[], row: any) => string;
    timeRemainingLimitFormatter: (value: string, row: any) => string;
    detailsLinkFormatter: (value: string, row: any) => string;
    detailsLinkSorter: (valueA: number, valueB: number, rowA: any, rowB: any) => number;
    timeRemainingLimitSorter: (valueA: number, valueB: number, rowA: any, rowB: any) => number;
    actionButtonFormatter: (_value: string, row: any, index: number) => string;
    updateTotals: (data: any) => void;
  }
}

declare global {
  interface JQuery {
    bootstrapTable(options: BootstrapTableOptions): JQuery;
    bootstrapTable(method: string, ...parameters: any[]): JQuery | any;
  }
}

interface AssessmentInstanceRow {
  assessment_label: string;
  client_fingerprint_id_change_count: number;
  date: Date;
  date_formatted: string;
  duration: string;
  duration_mins: number;
  duration_secs: number;
  group_id: number | null;
  group_name: string | null;
  group_roles: string[] | null;
  highest_score: boolean;
  max_points: number;
  name: string | null;
  number: number;
  open: boolean;
  points: number;
  role: string | null;
  score_perc: number | null;
  time_remaining: string;
  time_remaining_sec: number | null;
  total_time: string;
  total_time_sec: number | null;
  uid: string | null;
  uid_list: string[] | null;
  user_id: number | null;
  user_name_list: string[] | null;
  username: string | null;
}

let assessmentGroupWork: boolean;
let assessmentMultipleInstance: boolean;
let assessmentNumber: number;
let assessmentSetAbbr: string;
let csrfToken: string;
let urlPrefix: string;
let bsTable: JQuery<HTMLElement>;

onDocumentReady(() => {
  assessmentGroupWork = $('#usersTable').data('group-work');
  assessmentMultipleInstance = $('#usersTable').data('assessment-multiple-instance');
  assessmentNumber = $('#usersTable').data('assessment-number');
  assessmentSetAbbr = $('#usersTable').data('assessment-set-abbr');
  csrfToken = $('#usersTable').data('csrf-token');
  urlPrefix = $('#usersTable').data('url-prefix');
  bsTable = $('#usersTable').bootstrapTable({
    buttons: {
      studentsOnly: {
        text: 'Students Only',
        icon: 'fa-user-graduate',
        attributes: { title: 'List only enrolled students' },
        event: () => {
          const table = $('#usersTable');
          const filterOn = !table.data('filter-student-only');
          table.data('filter-student-only', filterOn);

          $('.columns button[name=studentsOnly]').toggleClass('active', filterOn);
          if (assessmentGroupWork) {
            table.bootstrapTable(
              'filterBy',
              { group_roles: 'Student' },
              {
                // the "filter" parameter has to be specified, hence we place a dummy placeholder here
                filterAlgorithm: (row: { group_roles: string }, _: any) => {
                  if (filterOn) {
                    return row.group_roles.includes('Student');
                  } else {
                    return true;
                  }
                },
              },
            );
          } else {
            table.bootstrapTable('filterBy', filterOn ? { role: 'Student' } : {});
          }
        },
      },
    },
    onPreBody() {
      $('.spinning-wheel').show();
    },
    onResetView() {
      $('.spinning-wheel').hide();

      window.updateTotals($('#usersTable').bootstrapTable('getData'));

      $('[data-toggle="popover"]').popover({
        sanitize: false,
        trigger: 'manual',
        container: 'body',
        html: true,
        placement: 'auto',
      });
      $('.time-limit-edit-button')
        .popover({
          sanitize: false,
          placement: 'right',
          title() {
            const row = $(this).data('row');
            return row.action === 'set_time_limit_all'
              ? 'Change Time Limits'
              : row.open
                ? 'Change Time Limit'
                : 'Re-Open Instance';
          },
          container: 'body',
          html: true,
          trigger: 'click',
          content: window.timeLimitEditPopoverContent,
        })
        .on('show.bs.popover', function () {
          $($(this).data('bs.popover').getTipElement()).css('max-width', '350px');
          $(this).find('.select-time-limit').change();
        });
    },
  });

  $(document).on('keydown', (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      String.fromCharCode(event.which).toLowerCase() === 'f'
    ) {
      $('.fixed-table-toolbar .search input').focus();
      event.preventDefault();
    }
  });

  $('#deleteAssessmentInstanceModal').on('show.bs.modal', function (event: any) {
    const button = $(event.relatedTarget); // Button that triggered the modal
    const uid = button.data('uid'); // Extract info from data-* attributes
    const name = button.data('name');
    const number = button.data('number');
    const group_name = button.data('group-name');
    const uid_list = button.data('uid-list');
    const date_formatted = button.data('date-formatted');
    const score_perc = button.data('score-perc');
    const assessment_instance_id = button.data('assessment-instance-id');
    const modal = $(this);

    modal.find('form').on('submit', (e) => {
      e.preventDefault();
      $.post(
        $(e.target).attr('action') ?? '',
        $(e.target).serialize(),
        function () {
          window.refreshTable();
        },
        'json',
      );
      modal.modal('hide');
    });

    modal.find('.modal-uid').text(uid);
    modal.find('.modal-name').text(name);
    modal.find('.modal-group-name').text(group_name);
    modal.find('.modal-uid-list').text(uid_list);
    modal.find('.modal-number').text(number);
    modal.find('.modal-date').text(date_formatted);
    modal.find('.modal-score-perc').text(score_perc);
    modal.find('.modal-assessment-instance-id').val(assessment_instance_id);
  });

  $('#deleteAllAssessmentInstancesModal').on('show.bs.modal', function () {
    const modal = $(this);

    modal.find('form').on('submit', (e) => {
      e.preventDefault();
      $.post(
        $(e.target).attr('action') ?? '',
        $(e.target).serialize(),
        function () {
          window.refreshTable();
        },
        'json',
      );
      modal.modal('hide');
    });
  });

  $('[data-toggle="modal"]').on('click', function (e) {
    e.stopPropagation(); // Keep click from changing sort
    $($(e.currentTarget).data('target')).modal('show');
  });
});

window.refreshTable = function () {
  bsTable.bootstrapTable('refresh', { silent: true });
};

window.popoverSubmitViaAjax = function (e: any, popover) {
  e.preventDefault();
  $.post(
    $(e.target).attr('action') ?? '',
    $(e.target).serialize(),
    function () {
      window.refreshTable();
    },
    'json',
  );
  $(popover).popover('hide');
};

window.timeLimitEditPopoverContent = function () {
  const that = $(this);
  const row = $(this).data('row');
  const form = $('<form name="set-time-limit-form" method="POST">');
  const action = row.action ? row.action : 'set_time_limit';
  form.append(`<p>Total time limit: ${row.total_time}<br/>
                    Remaining time: ${row.time_remaining}
                 </p>`);
  form.append(`<input type="hidden" name="__action" value="${action}">`);
  form.append(`<input type="hidden" name="__csrf_token" value="${csrfToken}">`);
  if (row.assessment_instance_id) {
    form.append(
      `<input type="hidden" name="assessment_instance_id" value="${row.assessment_instance_id}">`,
    );
  }
  const select = $('<select class="form-control select-time-limit" name="plus_minus">');
  if (row.time_remaining_sec !== null) {
    if (row.has_open_instance) {
      select.append('<option value="+1">Add to instances with time limit</option>');
      select.append('<option value="-1">Subtract from instances with time limit</option>');
    } else {
      select.append('<option value="+1">Add</option>');
      select.append('<option value="-1">Subtract</option>');
    }
  }
  select.append('<option value="set_total">Set total time limit to</option>');
  select.append('<option value="set_rem">Set remaining time to</option>');
  if (!row.open || row.time_remaining_sec !== null) {
    select.append('<option value="unlimited">Remove time limit</option>');
  }
  if (row.open !== false && (row.time_remaining_sec === null || row.time_remaining_sec > 0)) {
    select.append('<option value="expire">Expire time limit</option>');
  }
  select.on('change', function () {
    $(this)
      .parents('form')
      .find('.time-limit-field')
      .toggle($(this).val() !== 'unlimited' && $(this).val() !== 'expire');
    $(this)
      .parents('form')
      .find('.reopen-closed-field')
      .toggle($(this).val() !== '+1' && $(this).val() !== '-1' && $(this).val() !== 'expire');
  });
  form.append(select);
  const new_time = $('<p class="form-inline">');
  new_time.append(
    '<input class="form-control time-limit-field" type="number" name="time_add" style="width: 5em" value="5">',
  );
  const time_ref_select = $('<select class="form-control time-limit-field" name="time_ref">');
  time_ref_select.append('<option value="minutes">minutes</option>');
  if (row.time_remaining_sec !== null) {
    time_ref_select.append('<option value="percent">% total limit</option>');
  }
  new_time.append(time_ref_select);
  form.append(new_time);
  if (row.has_closed_instance) {
    const checkbox = $(
      '<div class="form-check mb-2 reopen-closed-field"><input class="form-check-input" type="checkbox" name="reopen_closed" value="true" id="reopen-closed"><label class="form-check-label" for="reopen-closed">Also re-open closed instances</label></div>',
    );
    checkbox.toggle(row.time_remaining_sec === null);
    form.append(checkbox);
  }
  const buttons = $('<div class="btn-toolbar pull-right">');
  const cancel_button = $('<button type="button" class="btn btn-secondary mr-2">Cancel</button>');
  cancel_button.click(function () {
    $(that).popover('hide');
  });
  buttons.append(cancel_button);
  buttons.append('<button type="submit" class="btn btn-success">Set</button>');
  form.append(buttons);
  form.on('submit', (e) => {
    window.popoverSubmitViaAjax(e, that as any);
  });
  return form;
};

window.scorebarFormatter = function (score) {
  if (score != null) {
    let bar = '<div class="progress bg" style="min-width: 5em; max-width: 20em;">';
    let left = '',
      right = '';
    if (score >= 50) {
      left = `${Math.floor(score)}%`;
    } else {
      right = `${Math.floor(score)}%`;
    }
    bar += `<div class="progress-bar bg-success" style="width: ${Math.floor(Math.min(100, score))}%">${left}</div>`;
    bar += `<div class="progress-bar bg-danger" style="width: ${100 - Math.floor(Math.min(100, score))}%">${right}</div>`;
    bar += '</div>';
    return bar;
  } else {
    return '';
  }
};

window.listFormatter = function (list) {
  if (!list || !list[0]) list = ['(empty)'];
  return '<small>' + list.join(', ') + '</small>';
};

window.uniqueListFormatter = function (list) {
  if (!list || !list[0]) list = ['(empty)'];
  const uniq = Array.from(new Set(list));
  return '<small>' + uniq.join(', ') + '</small>';
};

window.timeRemainingLimitFormatter = function (value, row) {
  const container = $('<span>');
  $('<a>')
    .addClass('btn btn-secondary btn-xs ml-1 time-limit-edit-button')
    .attr('role', 'button')
    .attr('id', `row${row.assessment_instance_id}PopoverTimeLimit`)
    .attr('tabindex', 0)
    .attr('data-row', JSON.stringify(row))
    .append($('<i class="bi-pencil-square" aria-hidden="true">'))
    .appendTo(container);
  value += container.html();
  return value;
};

window.detailsLinkFormatter = function (value, row) {
  const name = assessmentGroupWork ? row.group_name : row.uid;

  let number;
  if (!assessmentMultipleInstance) {
    number = row.number === 1 ? '' : `#${row.number}`;
  }
  return `<a href="${urlPrefix}/assessment_instance/${value}">${assessmentSetAbbr}${assessmentNumber}${number} for ${name}</a>`;
};

window.detailsLinkSorter = function (valueA, valueB, rowA, rowB) {
  let nameA, nameB, idA, idB;
  if (assessmentGroupWork) {
    (nameA = rowA.group_name), (nameB = rowB.group_name);
    (idA = rowA.group_id), (idB = rowB.group_id);
  } else {
    (nameA = rowA.uid), (nameB = rowB.uid);
    (idA = rowA.user_id), (idB = rowB.user_id);
  }

  // Compare first by UID/group name, then user/group ID, then
  // instance number, then by instance ID.
  let compare = nameA.localeCompare(nameB);
  if (!compare) compare = idA - idB;
  if (!compare) compare = rowA.number - rowB.number;
  if (!compare) compare = valueA - valueB;
  return compare;
};

window.timeRemainingLimitSorter = function (valueA, valueB, rowA, rowB) {
  // Closed assessments are listed first, followed by time limits
  // ascending, followed by open without a time limit
  return Number(rowA.open) - Number(rowB.open) || (valueA ?? Infinity) - (valueB ?? Infinity);
};

window.actionButtonFormatter = function (_value, row) {
  const ai_id = row.assessment_instance_id;
  const container = $('<div>');
  const dropdown = $('<div class="dropdown">').appendTo(container);
  $('<button type="button">')
    .addClass('btn btn-secondary btn-xs dropdown-toggle')
    .attr('data-toggle', 'dropdown')
    .attr('aria-haspopup', 'true')
    .attr('aria-expanded', 'false')
    .attr('data-boundary', 'window')
    .text('Action')
    .appendTo(dropdown);
  $('<div>')
    .attr('id', `row${ai_id}PopoverClose`)
    .attr('tabindex', 0)
    .attr('data-toggle', 'popover')
    .attr('title', 'Confirm close')
    .attr(
      'data-content',
      `<form name="close-form" method="POST" onsubmit="popoverSubmitViaAjax(event, '#row${ai_id}PopoverClose')">
                 <input type="hidden" name="__action" value="close">
                 <input type="hidden" name="__csrf_token" value="${csrfToken}">
                 <input type="hidden" name="assessment_instance_id" value="${ai_id}">
                 <button type="button" class="btn btn-secondary" onclick="$('#row${ai_id}PopoverClose').popover('hide')">Cancel</button>
                 <button type="submit" class="btn btn-danger">Grade and close</button>
               </form>`,
    )
    .appendTo(dropdown);
  $('<div>')
    .attr('id', `row${ai_id}PopoverRegrade`)
    .attr('tabindex', 0)
    .attr('data-toggle', 'popover')
    .attr('title', 'Confirm regrade')
    .attr(
      'data-content',
      `<form name="regrade-form" method="POST">
                 <input type="hidden" name="__action" value="regrade">
                 <input type="hidden" name="__csrf_token" value="${csrfToken}">
                 <input type="hidden" name="assessment_instance_id" value="${ai_id}">
                 <button type="button" class="btn btn-secondary" onclick="$('#row${ai_id}PopoverRegrade').popover('hide')">Cancel</button>
                 <button type="submit" class="btn btn-primary">Regrade</button>
               </form>`,
    )
    .appendTo(dropdown);
  const menu = $('<div>')
    .addClass('dropdown-menu')
    .attr('onclick', 'window.event.preventDefault()')
    .appendTo(dropdown);
  //<% if (authz_data.has_course_instance_permission_edit) { %>
  $('<button>')
    .addClass('dropdown-item')
    .attr('data-toggle', 'modal')
    .attr('data-target', '#deleteAssessmentInstanceModal')
    .attr('data-uid', row.uid)
    .attr('data-name', row.name)
    .attr('data-number', row.number)
    .attr('data-date-formatted', row.date_formatted)
    .attr('data-group-name', row.group_name)
    .attr('data-uid-list', row.uid_list?.join(', ') || 'empty')
    .attr('data-score-perc', Math.floor(row.score_perc))
    .attr('data-assessment-instance-id', row.assessment_instance_id)
    .append($('<i>').addClass('fas fa-times mr-2').attr('aria-hidden', 'true'))
    .append('Delete')
    .appendTo(menu);

  $('<button>')
    .addClass('dropdown-item' + (row.open ? '' : ' disabled'))
    .attr('onclick', `$("#row${ai_id}PopoverClose").popover("show")`)
    .append($('<i>').addClass('fas fa-ban mr-2').attr('aria-hidden', 'true'))
    .append('Grade &amp; Close')
    .appendTo(menu);

  $('<button>')
    .addClass('dropdown-item' + (!row.open ? '' : ' disabled'))
    .attr('onclick', `$("#row${ai_id}PopoverTimeLimit").popover("show")`)
    .append($('<i>').addClass('fas fa-lock-open mr-2').attr('aria-hidden', 'true'))
    .append('Re-open')
    .appendTo(menu);

  $('<button>')
    .addClass('dropdown-item')
    .attr('onclick', `$("#row${ai_id}PopoverRegrade").popover("show")`)
    .append($('<i>').addClass('fas fa-sync mr-2').attr('aria-hidden', 'true'))
    .append('Regrade')
    .appendTo(menu);

  //<% } else { %>
  $('<button>')
    .addClass('dropdown-item disabled')
    .append('Must have editor permission')
    .appendTo(menu);

  //<% } %>

  return container.html();
};

window.updateTotals = function (data) {
  let time_limit_list: Record<string, any> = new Object();
  let remaining_time_min = 0;
  let remaining_time_max = 0;
  let has_open_instance = false;
  let has_closed_instance = false;

  data.forEach(function (row: AssessmentInstanceRow) {
    if (!row.open) {
      has_closed_instance = true;
    } else if (row.time_remaining_sec === null) {
      has_open_instance = true;
    } else {
      if (row.total_time_sec === null) {
        return;
      }
      if (!(row.total_time_sec in time_limit_list)) {
        time_limit_list[row.total_time_sec] = row.total_time;
      }
      if (remaining_time_min === 0 || remaining_time_min > row.time_remaining_sec) {
        remaining_time_min = row.time_remaining_sec;
      }
      if (remaining_time_max === 0 || remaining_time_max < row.time_remaining_sec) {
        remaining_time_max = row.time_remaining_sec;
      }
    }
  });

  time_limit_list = Object.values(time_limit_list);
  if (time_limit_list.length > 5) {
    time_limit_list.splice(3, time_limit_list.length - 4, '...');
  }
  const time_limit_totals = {
    total_time: time_limit_list.length > 0 ? time_limit_list.join(', ') : 'No time limits',
    time_remaining_sec: remaining_time_max,
    has_open_instance,
    has_closed_instance,
    action: 'set_time_limit_all',
    time_remaining: '',
  };
  if (remaining_time_min === null) {
    time_limit_totals.time_remaining = 'No time limits';
  } else if (remaining_time_max < 60) {
    time_limit_totals.time_remaining = 'Less than a minute';
  } else if (remaining_time_min < 60) {
    time_limit_totals.time_remaining = 'up to ' + Math.floor(remaining_time_max / 60) + ' min';
  } else if (Math.floor(remaining_time_min / 60) === Math.floor(remaining_time_max / 60)) {
    time_limit_totals.time_remaining = Math.floor(remaining_time_min / 60) + ' min';
  } else {
    time_limit_totals.time_remaining =
      'between ' +
      Math.floor(remaining_time_min / 60) +
      ' and ' +
      Math.floor(remaining_time_max / 60) +
      ' min';
  }

  $('.time-limit-edit-all-button').data('row', time_limit_totals);
};
