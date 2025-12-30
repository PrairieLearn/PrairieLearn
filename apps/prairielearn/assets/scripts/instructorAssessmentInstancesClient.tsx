import { Temporal } from '@js-temporal/polyfill';
import { on } from 'delegated-events';
import { render } from 'preact';
import React, { useState } from 'preact/hooks';

import { onDocumentReady, templateFromAttributes } from '@prairielearn/browser-utils';
import { formatDate } from '@prairielearn/formatter';
import { escapeHtml, html } from '@prairielearn/html';

import { ScorebarHtml } from '../../src/components/Scorebar.js';
import { assertNever } from '../../src/lib/types.js';
import { type AssessmentInstanceRow } from '../../src/pages/instructorAssessmentInstances/instructorAssessmentInstances.types.js';

import { getPopoverTriggerForContainer } from './lib/popover.js';

type TimeLimitAction =
  | 'set_total'
  | 'set_rem'
  | 'set_exact'
  | 'add'
  | 'subtract'
  | 'remove'
  | 'expire';

onDocumentReady(() => {
  const dataset = document.getElementById('usersTable')?.dataset;
  if (!dataset) {
    return;
  }
  const { assessmentSetAbbr, assessmentNumber, csrfToken, urlPrefix } = dataset;
  const assessmentTeamWork = dataset.assessmentTeamWork === 'true';
  const assessmentMultipleInstance = dataset.assessmentMultipleInstance === 'true';
  const hasCourseInstancePermissionEdit = dataset.hasCourseInstancePermissionEdit === 'true';
  const timezone = dataset.timezone ?? 'UTC';

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
          // The filter object triggers the customSearch function, which performs the actual search.
          table.bootstrapTable('filterBy', filterOn ? { role: 'Student' } : {});
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
          customClass: 'popover-narrow-fixed',
        })
        .on('show.bs.popover', function () {
          $(this).find('.select-time-limit').trigger('change');
        });
    },
    customSearch: (
      data: AssessmentInstanceRow[],
      searchText: string,
      filter?: Record<string, any>,
    ) => {
      return data.filter((row) => {
        const search = searchText.toLowerCase();
        return assessmentTeamWork
          ? (!filter?.role || row.team_roles?.includes(filter.role)) &&
              (row.team_name?.toLowerCase().includes(search) ||
                row.uid_list?.some((uid) => uid.toLowerCase().includes(search)) ||
                row.user_name_list?.some((name) => name?.toLowerCase().includes(search)) ||
                row.team_roles?.some((role) => role.toLowerCase().includes(search)))
          : (!filter?.role || row.role === filter.role) &&
              (row.uid?.toLowerCase().includes(search) ||
                row.name?.toLowerCase().includes(search) ||
                row.role.toLowerCase().includes(search));
      });
    },
    columns: tableColumns(assessmentTeamWork),
  });

  on('submit', 'form.js-popover-form', (event) => {
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

    modal
      .parents('form')
      .off('submit')
      .on('submit', (e) => {
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
        'data-team-name': '.modal-team-name',
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

    modal
      .parents('form')
      .off('submit')
      .on('submit', (e) => {
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

  $('[data-bs-toggle="modal"]').on('click', function (e) {
    e.stopPropagation(); // Keep click from changing sort
    $($(e.currentTarget).data('target')).modal('show');
  });

  function tableColumns(assessmentTeamWork: boolean) {
    return [
      {
        field: 'assessment_instance_id',
        title: '<span class="visually-hidden">Assessment Instance</span>',
        sortable: true,
        sorter: detailsLinkSorter,
        formatter: detailsLinkFormatter,
        class: 'align-middle sticky-column text-nowrap',
        switchable: false,
      },
      ...(assessmentTeamWork
        ? [
            {
              field: 'team_name',
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
              field: 'team_roles',
              title: html`
                Roles
                <button
                  class="btn btn-xs btn-ghost"
                  type="button"
                  aria-label="Roles help"
                  data-bs-toggle="modal"
                  data-bs-target="#role-help"
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
                  aria-label="Roles help"
                  data-bs-toggle="modal"
                  data-bs-target="#role-help"
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
            aria-label="Duration help"
            data-bs-toggle="modal"
            data-bs-target="#duration-help"
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
            aria-label="Remaining time help"
            data-bs-toggle="modal"
            data-bs-target="#time-remaining-help"
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
            aria-label="Fingerprint changes help"
            data-bs-toggle="modal"
            data-bs-target="#fingerprint-changes-help"
          >
            <i class="bi-question-circle-fill" aria-hidden="true"></i>
          </button>
        `,
        class: 'text-center align-middle',
        // Hidden for teamwork by default, as it is not as relevant in that context
        visible: !assessmentTeamWork,
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

  function TimeLimitExplanation({ action }: { action: TimeLimitAction }) {
    let explanation = '';
    switch (action) {
      case 'set_total':
        explanation =
          'Updating the total time limit will set the given amount of time for the assessment based on when the assessment was started.';
        break;
      case 'set_rem':
        explanation =
          'Updating the time remaining will set the given amount of time for the assessment based on the current time.';
        break;
      case 'set_exact':
        explanation = 'This will set the exact closing time for the assessment.';
        break;
      case 'add':
        explanation = 'This will add the given amount of time to the remaining time limit.';
        break;
      case 'subtract':
        explanation = 'This will subtract the given amount of time from the remaining time limit.';
        break;
      case 'remove':
        explanation = 'This will remove the time limit and the assessment will remain open.';
        break;
      case 'expire':
        explanation =
          'This will expire the time limit and students will be unable to submit any further answers.';
        break;
      default:
        assertNever(action);
    }
    return <small class="form-text text-muted">{explanation}</small>;
  }

  function TimeLimitEditPopover({
    row,
  }: {
    row: {
      action: string | null;
      assessment_instance_id: number;
      date: string;
      has_closed_instance: boolean;
      has_open_instance: boolean;
      total_time: string;
      total_time_sec: number;
      time_remaining: string;
      time_remaining_sec: number | null;
      open: boolean;
    };
  }) {
    const [form, setForm] = useState<{
      action: TimeLimitAction;
      time_add: number;
      date: string;
      reopen_closed: boolean;
      reopen_without_limit: boolean;
    }>(() => ({
      action: row.time_remaining_sec !== null ? 'add' : 'set_total',
      time_add: 5,
      date: Temporal.Now.zonedDateTimeISO(timezone).toPlainDateTime().toString().slice(0, 16),
      reopen_closed: false,
      reopen_without_limit: true,
    }));
    const showTimeLimitOptions =
      row.action === 'set_time_limit_all' || row.open || !form.reopen_without_limit;

    function updateFormState<T extends keyof typeof form>(key: T, value: (typeof form)[T]) {
      setForm({
        ...form,
        [key]: value,
      });
    }

    function proposedClosingTime() {
      const totalTime = Math.round(row.total_time_sec);

      let startDate = Temporal.Instant.from(row.date).toZonedDateTimeISO(timezone);
      if (form.action === 'set_total') {
        startDate = startDate.add({ minutes: form.time_add });
      } else if (form.action === 'set_rem') {
        startDate = Temporal.Now.zonedDateTimeISO(timezone).add({ minutes: form.time_add });
      } else if (form.action === 'add') {
        startDate = startDate.add({ seconds: totalTime }).add({ minutes: form.time_add });
      } else if (form.action === 'subtract') {
        startDate = startDate.add({ seconds: totalTime }).subtract({ minutes: form.time_add });
      }

      return formatDate(new Date(startDate.epochMilliseconds), timezone);
    }

    return (
      <form name="set-time-limit-form" class="js-popover-form" method="POST">
        <input type="hidden" name="__action" value={row.action ?? 'set_time_limit'} />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        {row.assessment_instance_id ? (
          <input type="hidden" name="assessment_instance_id" value={row.assessment_instance_id} />
        ) : null}
        {row.action !== 'set_time_limit_all' && !row.open ? (
          <div>
            <div class="form-check">
              <input
                class="form-check-input"
                type="radio"
                name="reopen_without_limit"
                id="reopen_without_limit"
                value="true"
                checked={form.reopen_without_limit}
                onClick={() => updateFormState('reopen_without_limit', true)}
              />
              <label class="form-check-label" for="reopen_without_limit">
                Re-open without time limit
              </label>
            </div>
            <div class="form-check">
              <input
                class="form-check-input"
                type="radio"
                name="reopen_without_limit"
                id="reopen_with_limit"
                value="false"
                checked={!form.reopen_without_limit}
                onClick={() => updateFormState('reopen_without_limit', false)}
              />
              <label class="form-check-label" for="reopen_with_limit">
                Re-open with time limit
              </label>
            </div>
          </div>
        ) : null}
        <p>
          Total time limit: {row.total_time}
          <br />
          Remaining time: {row.time_remaining}
        </p>
        {showTimeLimitOptions ? (
          <p>
            <select
              class="form-select select-time-limit"
              name="action"
              aria-label="Time limit options"
              value={form.action}
              onChange={(e) => updateFormState('action', e.currentTarget.value as TimeLimitAction)}
            >
              {row.time_remaining_sec !== null ? (
                row.has_open_instance ? (
                  <>
                    <option value="add">Add to instances with time limit</option>
                    <option value="subtract">Subtract from instances with time limit</option>
                  </>
                ) : (
                  <>
                    <option value="add">Add</option>
                    <option value="subtract">Subtract</option>
                  </>
                )
              ) : null}
              <option value="set_total">Set total time limit</option>
              <option value="set_rem">Set remaining time</option>
              <option value="set_exact">Set exact closing time</option>
              {row.action === 'set_time_limit_all' ||
              (row.open && row.time_remaining) !== 'Open (no time limit)' ? (
                <option value="remove">Remove time limit</option>
              ) : null}
              {row.open && row.time_remaining !== 'Expired' ? (
                <option value="expire">Expire time limit</option>
              ) : null}
            </select>
            <TimeLimitExplanation action={form.action} />
          </p>
        ) : null}
        {showTimeLimitOptions &&
        form.action !== 'set_exact' &&
        form.action !== 'remove' &&
        form.action !== 'expire' ? (
          <div class="input-group mb-2">
            <input
              class="form-control time-limit-field"
              type="number"
              name="time_add"
              aria-label="Time value"
              value={form.time_add}
              onChange={(e) =>
                updateFormState('time_add', Number.parseFloat(e.currentTarget.value))
              }
            />
            <span class="input-group-text time-limit-field">minutes</span>
          </div>
        ) : null}
        {showTimeLimitOptions && form.action === 'set_exact' ? (
          <div class="input-group date-picker mb-2">
            <input
              class="form-control date-picker"
              type="datetime-local"
              name="date"
              value={form.date}
              onChange={(e) => updateFormState('date', e.currentTarget.value)}
            />
            <span class="input-group-text date-picker">{timezone}</span>
          </div>
        ) : null}
        {(row.open || !form.reopen_without_limit) &&
        (form.action === 'set_total' ||
          form.action === 'set_rem' ||
          form.action === 'add' ||
          form.action === 'subtract') ? (
          <p>Proposed closing time: {proposedClosingTime()}</p>
        ) : null}
        <p>
          {row.has_closed_instance ? (
            <div class="form-check">
              <input
                class="form-check-input"
                type="checkbox"
                name="reopen_closed"
                value="true"
                checked={form.reopen_closed}
                id="reopen_closed"
                onChange={(e) => updateFormState('reopen_closed', e.currentTarget.checked)}
              />
              <label class="form-check-label" for="reopen_closed">
                Also re-open closed instances
              </label>
            </div>
          ) : null}
        </p>
        <div class="btn-toolbar justify-content-end">
          <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="popover">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            Set
          </button>
        </div>
      </form>
    );
  }

  function timeLimitEditPopoverContent(this: any) {
    const div = document.createElement('div');

    render(<TimeLimitEditPopover row={$(this).data('row')} />, div);

    return div;
  }

  function scorebarFormatter(score: number | null) {
    return ScorebarHtml(score).toString();
  }

  function listFormatter(list: string[] | null) {
    if (!list?.[0]) list = ['(empty)'];
    return html`<small>${list.join(', ')}</small>`;
  }

  function uniqueListFormatter(list: string[] | null) {
    if (!list?.[0]) list = ['(empty)'];
    const uniq = Array.from(new Set(list));
    return html`<small>${uniq.join(', ')}</small>`;
  }

  function timeRemainingLimitFormatter(value: string, row: AssessmentInstanceRow) {
    return html`
      ${value}
      <span>
        <button
          class="btn btn-secondary btn-xs ms-1 time-limit-edit-button"
          id="row${row.assessment_instance_id}PopoverTimeLimit"
          aria-label="Change time limit"
          data-row="${JSON.stringify(row)}"
          data-bs-placement="bottom"
        >
          <i class="bi-pencil-square" aria-hidden="true"></i>
        </button>
      </span>
    `.toString();
  }

  function detailsLinkFormatter(value: string, row: AssessmentInstanceRow) {
    const name = assessmentTeamWork ? row.team_name : row.uid;

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
    const nameKey = assessmentTeamWork ? 'team_name' : 'uid';
    const idKey = assessmentTeamWork ? 'team_id' : 'user_id';

    const nameA = rowA[nameKey];
    const nameB = rowB[nameKey];
    const idA = rowA[idKey] ?? '';
    const idB = rowB[idKey] ?? '';

    // Compare first by UID/team name, then user/team ID, then
    // instance number, then by instance ID.
    let compare = nameA?.localeCompare(nameB ?? '');
    if (!compare) compare = Number.parseInt(idA) - Number.parseInt(idB);
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
    return Number(rowA.open) - Number(rowB.open) || valueA - valueB;
  }

  function actionButtonFormatter(_value: string, row: AssessmentInstanceRow) {
    const ai_id = Number.parseInt(row.assessment_instance_id);
    if (!csrfToken) {
      throw new Error('CSRF token not found');
    }
    return html`
      <div>
        <div class="dropdown">
          <button
            type="button"
            class="btn btn-secondary btn-xs dropdown-toggle"
            data-bs-toggle="dropdown"
            aria-haspopup="true"
            aria-expanded="false"
            data-bs-boundary="window"
          >
            Action
          </button>
          <div class="dropdown-menu">
            ${hasCourseInstancePermissionEdit
              ? html`
                  <button
                    class="dropdown-item"
                    data-bs-toggle="modal"
                    data-bs-target="#deleteAssessmentInstanceModal"
                    data-uid="${row.uid}"
                    data-name="${row.name}"
                    data-number="${row.number}"
                    data-date-formatted="${row.date_formatted}"
                    data-team-name="${row.team_name}"
                    data-uid-list="${row.uid_list?.join(', ') || 'empty'}"
                    data-score-perc="${Math.floor(row.score_perc ?? 0)}"
                    data-assessment-instance-id="${row.assessment_instance_id}"
                  >
                    <i class="fas fa-times me-2" aria-hidden="true"></i>
                    Delete
                  </button>
                  <button
                    class="dropdown-item ${row.open ? '' : 'disabled'}"
                    data-bs-toggle="popover"
                    data-bs-container="body"
                    data-bs-html="true"
                    data-bs-title="Confirm close"
                    data-bs-content="${escapeHtml(CloseForm({ csrfToken, ai_id }))}"
                    data-bs-placement="auto"
                  >
                    <i class="fas fa-ban me-2" aria-hidden="true"></i>
                    Grade &amp; Close
                  </button>
                  <button
                    class="dropdown-item ${!row.open ? '' : 'disabled'}"
                    onclick="$('#row${ai_id}PopoverTimeLimit').popover('show')"
                  >
                    <i class="fas fa-clock me-2" aria-hidden="true"></i>
                    Re-open
                  </button>
                  <button
                    class="dropdown-item"
                    data-bs-toggle="popover"
                    data-bs-container="body"
                    data-bs-html="true"
                    data-bs-title="Confirm regrade"
                    data-bs-content="${escapeHtml(RegradeForm({ csrfToken, ai_id }))}"
                    data-bs-placement="auto"
                  >
                    <i class="fas fa-sync me-2" aria-hidden="true"></i>
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
    let time_limit_list: Record<string, any> = {};
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
    if (time_limit_list.length === 0) {
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-primary">Regrade</button>
    </form>
  `;
}
