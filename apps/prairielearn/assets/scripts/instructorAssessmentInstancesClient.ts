import { on } from 'delegated-events';

import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';
import { escapeHtml, html } from '@prairielearn/html';

import { Scorebar } from '../../src/components/Scorebar.html.js';
import { type AssessmentInstanceRow } from '../../src/pages/instructorAssessmentInstances/instructorAssessmentInstances.types.js';

import { getPopoverTriggerForContainer } from './lib/popover.js';

onDocumentReady(() => {
  const dataset = document.getElementById('usersTable')?.dataset;
  if (!dataset) {
    return;
  }
  const { assessmentSetAbbr, assessmentNumber, csrfToken, urlPrefix } = dataset;
  const assessmentGroupWork = dataset.assessmentGroupWork === 'true';
  const assessmentMultipleInstance = dataset.assessmentMultipleInstance === 'true';
  const hasCourseInstancePermissionEdit = dataset.hasCourseInstancePermissionEdit === 'true';

  const bsTable = $('#usersTable').bootstrapTable({
    // TODO: If we can pick up the following change, we can drop the `icons` config here:
    // https://github.com/wenzhixin/bootstrap-table/pull/7190
    iconsPrefix: 'fa',
    icons: {
      refresh: 'fa-sync',
      autoRefresh: 'fa-clock',
      columns: 'fa-table-list',
    },

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

      updateTotals($('#usersTable').bootstrapTable('getData'));

      $('.time-limit-edit-button')
        .popover({
          sanitize: false,
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
          content: timeLimitEditPopoverContent,
          customClass: 'popover-wide',
        })
        .on('show.bs.popover', function () {
          $(this).find('.select-time-limit').trigger('change');
        });
    },
    customSearch: (data: AssessmentInstanceRow[], searchText: string) => {
      return data.filter((row) => {
        const search = searchText.toLowerCase();
        return assessmentGroupWork
          ? row.group_name?.toLowerCase().includes(search) ||
              row.uid_list?.some((uid) => uid.toLowerCase().includes(search)) ||
              row.user_name_list?.some((name) => name?.toLowerCase().includes(search)) ||
              row.group_roles?.some((role) => role.toLowerCase().includes(search))
          : row.uid?.toLowerCase().includes(search) ||
              row.name?.toLowerCase().includes(search) ||
              row.role?.toLowerCase().includes(search);
      });
    },
    columns: tableColumns(assessmentGroupWork),
  });

  on('submit', 'form.js-popover-form', (event) => {
    if (!event.currentTarget) return;

    event.preventDefault();
    $.post(
      window.location.pathname,
      $(event.currentTarget).serialize(),
      function () {
        refreshTable();
      },
      'json',
    );

    // Immediately close the popover. Note that this is done before the above
    // HTTP request has finished. A potential improvement would be to disable
    // the form and show a spinner until the request completes, at which point
    // the popover would be closed.
    const popover = event.currentTarget.closest<HTMLElement>('.popover');
    if (popover) {
      const trigger = getPopoverTriggerForContainer(popover);
      if (trigger) {
        $(trigger).popover('hide');
      }
    }
  });

  $(document).on('keydown', (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      String.fromCharCode(event.which).toLowerCase() === 'f' &&
      $('.fixed-table-toolbar .search input')[0] !== document.activeElement
    ) {
      $('.fixed-table-toolbar .search input').trigger('focus');
      event.preventDefault();
    }
  });

  $('#deleteAssessmentInstanceModal').on('show.bs.modal', function (event) {
    const modal = $(this);

    modal.find('form').on('submit', (e) => {
      e.preventDefault();
      $.post(
        $(e.target).attr('action') ?? '',
        $(e.target).serialize(),
        function () {
          refreshTable();
        },
        'json',
      );
      modal.modal('hide');
    });

    // @ts-expect-error -- The BS5 types don't include the `relatedTarget` property on jQuery events.
    const { relatedTarget } = event;

    if (relatedTarget) {
      templateFromAttributes(relatedTarget, modal[0], {
        'data-uid': '.modal-uid',
        'data-name': '.modal-name',
        'data-group-name': '.modal-group-name',
        'data-uid-list': '.modal-uid-list',
        'data-number': '.modal-number',
        'data-date-formatted': '.modal-date',
        'data-score-perc': '.modal-score-perc',
        'data-assessment-instance-id': '.modal-assessment-instance-id',
      });
    }
  });

  $('#deleteAllAssessmentInstancesModal').on('show.bs.modal', function () {
    const modal = $(this);

    modal.find('form').on('submit', (e) => {
      e.preventDefault();
      $.post(
        $(e.target).attr('action') ?? '',
        $(e.target).serialize(),
        function () {
          refreshTable();
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

  function tableColumns(assessmentGroupWork: boolean) {
    return [
      {
        field: 'assessment_instance_id',
        title: '<span class="sr-only">Assessment Instance</span>',
        sortable: true,
        sorter: detailsLinkSorter,
        formatter: detailsLinkFormatter,
        class: 'align-middle sticky-column text-nowrap',
        switchable: false,
      },
      ...(assessmentGroupWork
        ? [
            {
              field: 'group_name',
              title: 'Name',
              visible: false,
              sortable: true,
              class: 'align-middle',
              switchable: true,
              formatter: (value: string) => html`${value}`.toString(),
            },
            {
              field: 'uid_list',
              title: 'Group Members',
              sortable: true,
              class: 'text-center align-middle text-wrap',
              formatter: listFormatter,
              switchable: true,
            },
            {
              field: 'user_name_list',
              title: 'Group Member Name',
              sortable: true,
              visible: false,
              class: 'text-center align-middle text-wrap',
              formatter: listFormatter,
              switchable: true,
            },
            {
              field: 'group_roles',
              title: html`
                Roles
                <button
                  class="btn btn-xs btn-ghost"
                  type="button"
                  title="Show roles help"
                  data-toggle="modal"
                  data-target="#role-help"
                >
                  <i class="bi-question-circle-fill" aria-hidden="true"></i>
                </button>
              `,
              sortable: true,
              class: 'text-center align-middle text-wrap',
              formatter: uniqueListFormatter,
              switchable: true,
            },
          ]
        : [
            {
              field: 'uid',
              title: 'UID',
              visible: false,
              sortable: true,
              class: 'align-middle text-nowrap',
              switchable: true,
              formatter: (value: string) => html`${value}`.toString(),
            },
            {
              field: 'name',
              title: 'Name',
              sortable: true,
              class: 'align-middle text-nowrap',
              switchable: true,
              formatter: (value: string) => html`${value}`.toString(),
            },
            {
              field: 'role',
              title: html`
                Role
                <button
                  class="btn btn-xs btn-ghost"
                  type="button"
                  title="Show roles help"
                  data-toggle="modal"
                  data-target="#role-help"
                >
                  <i class="bi-question-circle-fill" aria-hidden="true"></i>
                </button>
              `,
              sortable: true,
              class: 'text-center align-middle text-nowrap',
              switchable: true,
            },
          ]),
      {
        field: 'number',
        title: 'Instance',
        visible: false,
        sortable: true,
        class: 'text-center align-middle',
        switchable: true,
      },
      {
        field: 'score_perc',
        title: 'Score',
        sortable: true,
        class: 'text-center align-middle',
        formatter: scorebarFormatter,
        switchable: true,
      },
      {
        field: 'date_formatted',
        title: 'Date started',
        sortable: true,
        sortName: 'date',
        class: 'text-center align-middle text-nowrap',
        switchable: true,
      },
      {
        field: 'duration',
        title: html`
          Duration
          <button
            class="btn btn-xs btn-ghost"
            type="button"
            title="Show duration help"
            data-toggle="modal"
            data-target="#duration-help"
          >
            <i class="bi-question-circle-fill" aria-hidden="true"></i>
          </button>
        `,
        sortable: true,
        sortName: 'duration_secs',
        class: 'text-center align-middle text-nowrap',
        switchable: true,
      },
      {
        field: 'time_remaining',
        title: html`
          Remaining
          <button
            class="btn btn-xs btn-ghost"
            type="button"
            title="Show remaining time help"
            data-toggle="modal"
            data-target="#time-remaining-help"
          >
            <i class="bi-question-circle-fill" aria-hidden="true"></i>
          </button>
        `,
        sortable: true,
        sortName: 'time_remaining_sec',
        sorter: timeRemainingLimitSorter,
        formatter: timeRemainingLimitFormatter,
        class: 'text-center align-middle text-nowrap',
        switchable: true,
      },
      {
        field: 'total_time',
        title: 'Total Time Limit',
        visible: false,
        sortable: true,
        sortName: 'total_time_sec',
        formatter: timeRemainingLimitFormatter,
        class: 'text-center align-middle',
        switchable: true,
      },
      {
        field: 'client_fingerprint_id_change_count',
        title: html`
          Fingerprint Changes
          <button
            class="btn btn-xs btn-ghost"
            type="button"
            title="Show fingerprint changes help"
            data-toggle="modal"
            data-target="#fingerprint-changes-help"
          >
            <i class="bi-question-circle-fill" aria-hidden="true"></i>
          </button>
        `,
        class: 'text-center align-middle',
        // Hidden for groupwork by default, as it is not as relevant in that context
        visible: !assessmentGroupWork,
        switchable: true,
        sortable: true,
      },
      {
        field: 'action_button',
        title: 'Actions',
        formatter: actionButtonFormatter,
        class: 'text-center align-middle',
        switchable: false,
      },
    ];
  }

  function refreshTable() {
    bsTable.bootstrapTable('refresh', { silent: true });
  }

  function timeLimitEditPopoverContent(this: any) {
    const row = $(this).data('row');
    const action = row.action ? row.action : 'set_time_limit';
    return html`
      <form name="set-time-limit-form" class="js-popover-form" method="POST">
        <p>
          Total time limit: ${row.total_time}<br />
          Remaining time: ${row.time_remaining}
        </p>
        <input type="hidden" name="__action" value="${action}" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        ${row.assessment_instance_id
          ? html`<input
              type="hidden"
              name="assessment_instance_id"
              value="${row.assessment_instance_id}"
            />`
          : ''}
        <select
          class="custom-select select-time-limit"
          name="plus_minus"
          aria-label="Time limit options"
          onchange="
            $(this).parents('form').find('.time-limit-field').toggle(this.value !== 'unlimited' && this.value !== 'expire');
            $(this).parents('form').find('.reopen-closed-field').toggle(this.value !== '+1' && this.value !== '-1' && this.value !== 'expire');
            "
        >
          ${row.time_remaining_sec !== null
            ? row.has_open_instance
              ? html`
                  <option value="+1">Add to instances with time limit</option>
                  <option value="-1">Subtract from instances with time limit</option>
                `
              : html`
                  <option value="+1">Add</option>
                  <option value="-1">Subtract</option>
                `
            : ''}
          <option value="set_total">Set total time limit to</option>
          <option value="set_rem">Set remaining time to</option>
          ${row.open || row.time_remaining_sec !== null
            ? html`<option value="unlimited">Remove time limit</option>`
            : ''}
          ${row.open !== false && (row.time_remaining_sec === null || row.time_remaining_sec > 0)
            ? html`<option value="expire">Expire time limit</option>`
            : ''}
        </select>
        <p class="form-inline">
          <input
            class="form-control time-limit-field"
            type="number"
            name="time_add"
            aria-label="Time value"
            style="width: 5em"
            value="5"
          />
          <select class="custom-select time-limit-field" name="time_ref" aria-label="Time unit">
            <option value="minutes">minutes</option>
            ${row.time_remaining_sec !== null
              ? html`<option value="percent">% total limit</option>`
              : ''}
          </select>
        </p>
        ${row.has_closed_instance
          ? html`
              <div class="form-check mb-2 reopen-closed-field">
                <input
                  class="form-check-input"
                  type="checkbox"
                  name="reopen_closed"
                  value="true"
                  id="reopen_closed"
                />
                <label class="form-check-label" for="reopen_closed">
                  Also re-open closed instances
                </label>
              </div>
            `
          : ''}
        <div class="btn-toolbar pull-right">
          <button type="button" class="btn btn-secondary mr-2" data-dismiss="popover">
            Cancel
          </button>
          <button type="submit" class="btn btn-success">Set</button>
        </div>
      </form>
    `.toString();
  }

  function scorebarFormatter(score: number | null) {
    return Scorebar(score).toString();
  }

  function listFormatter(list: string[]) {
    if (!list || !list[0]) list = ['(empty)'];
    return html`<small>${list.join(', ')}</small>`;
  }

  function uniqueListFormatter(list: string[]) {
    if (!list || !list[0]) list = ['(empty)'];
    const uniq = Array.from(new Set(list));
    return html`<small>${uniq.join(', ')}</small>`;
  }

  function timeRemainingLimitFormatter(value: string, row: AssessmentInstanceRow) {
    return html`
      ${value}
      <span>
        <button
          class="btn btn-secondary btn-xs ml-1 time-limit-edit-button"
          id="row${row.assessment_instance_id}PopoverTimeLimit"
          aria-label="Change time limit"
          data-row="${JSON.stringify(row)}"
          data-placement="bottom"
          data-boundary="window"
        >
          <i class="bi-pencil-square" aria-hidden="true"></i>
        </a>
      </span>
    `.toString();
  }

  function detailsLinkFormatter(value: string, row: AssessmentInstanceRow) {
    const name = assessmentGroupWork ? row.group_name : row.uid;

    let number;
    if (!assessmentMultipleInstance) {
      number = row.number === 1 ? '' : `#${row.number}`;
    }
    return html`
      <a href="${urlPrefix}/assessment_instance/${value}">
        ${assessmentSetAbbr}${assessmentNumber}${number} for ${name}
      </a>
    `.toString();
  }

  function detailsLinkSorter(
    valueA: number,
    valueB: number,
    rowA: AssessmentInstanceRow,
    rowB: AssessmentInstanceRow,
  ) {
    const nameKey = assessmentGroupWork ? 'group_name' : 'uid';
    const idKey = assessmentGroupWork ? 'group_id' : 'user_id';

    const nameA = rowA[nameKey];
    const nameB = rowB[nameKey];
    const idA = rowA[idKey] ?? '';
    const idB = rowB[idKey] ?? '';

    // Compare first by UID/group name, then user/group ID, then
    // instance number, then by instance ID.
    let compare = nameA?.localeCompare(nameB ?? '');
    if (!compare) compare = (parseInt(idA) ?? 0) - (parseInt(idB) ?? 0);
    if (!compare) compare = (rowA.number ?? 0) - (rowB.number ?? 0);
    if (!compare) compare = valueA - valueB;
    return compare;
  }

  function timeRemainingLimitSorter(
    valueA: number,
    valueB: number,
    rowA: AssessmentInstanceRow,
    rowB: AssessmentInstanceRow,
  ) {
    // Closed assessments are listed first, followed by time limits
    // ascending, followed by open without a time limit
    return Number(rowA.open) - Number(rowB.open) || (valueA ?? Infinity) - (valueB ?? Infinity);
  }

  function actionButtonFormatter(_value: string, row: AssessmentInstanceRow) {
    const ai_id = parseInt(row.assessment_instance_id);
    if (!csrfToken) {
      throw new Error('CSRF token not found');
    }
    return html`
      <div>
        <div class="dropdown">
          <button
            type="button"
            class="btn btn-secondary btn-xs dropdown-toggle"
            data-toggle="dropdown"
            aria-haspopup="true"
            aria-expanded="false"
            data-boundary="window"
          >
            Action
          </button>
          <div class="dropdown-menu">
            ${hasCourseInstancePermissionEdit
              ? html`
                  <button
                    class="dropdown-item"
                    data-toggle="modal"
                    data-target="#deleteAssessmentInstanceModal"
                    data-uid="${row.uid}"
                    data-name="${row.name}"
                    data-number="${row.number}"
                    data-date-formatted="${row.date_formatted}"
                    data-group-name="${row.group_name}"
                    data-uid-list="${row.uid_list?.join(', ') || 'empty'}"
                    data-score-perc="${Math.floor(row.score_perc ?? 0)}"
                    data-assessment-instance-id="${row.assessment_instance_id}"
                  >
                    <i class="fas fa-times mr-2" aria-hidden="true"></i>
                    Delete
                  </button>
                  <button
                    class="dropdown-item ${row.open ? '' : 'disabled'}"
                    data-toggle="popover"
                    data-container="body"
                    data-title="Confirm close"
                    data-html="true"
                    data-content="${escapeHtml(CloseForm({ csrfToken, ai_id }))}"
                    data-placement="auto"
                  >
                    <i class="fas fa-ban mr-2" aria-hidden="true"></i>
                    Grade &amp; Close
                  </button>
                  <button
                    class="dropdown-item ${!row.open ? '' : 'disabled'}"
                    onclick="$('#row${ai_id}PopoverTimeLimit').popover('show')"
                  >
                    <i class="fas fa-clock mr-2" aria-hidden="true"></i>
                    Re-open
                  </button>
                  <button
                    class="dropdown-item"
                    data-toggle="popover"
                    data-container="body"
                    data-title="Confirm regrade"
                    data-html="true"
                    data-content="${escapeHtml(RegradeForm({ csrfToken, ai_id }))}"
                    data-placement="auto"
                  >
                    <i class="fas fa-sync mr-2" aria-hidden="true"></i>
                    Regrade
                  </button>
                `
              : html` <button class="dropdown-item disabled">Must have editor permission</button> `}
          </div>
        </div>
      </div>
    `;
  }

  function updateTotals(data: AssessmentInstanceRow[]) {
    let time_limit_list: Record<string, any> = new Object();
    let remaining_time_min = 0;
    let remaining_time_max = 0;
    let has_open_instance = false;
    let has_closed_instance = false;

    data.forEach(function (row) {
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
  }
});

function CloseForm({ csrfToken, ai_id }: { csrfToken: string; ai_id: number }) {
  return html`
    <form name="close-form" class="js-popover-form" method="POST">
      <input type="hidden" name="__action" value="close" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="assessment_instance_id" value="${ai_id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-danger">Grade and close</button>
    </form>
  `;
}

function RegradeForm({ csrfToken, ai_id }: { csrfToken: string; ai_id: number }) {
  return html`
    <form name="regrade-form" method="POST">
      <input type="hidden" name="__action" value="regrade" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="assessment_instance_id" value="${ai_id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-primary">Regrade</button>
    </form>
  `;
}
