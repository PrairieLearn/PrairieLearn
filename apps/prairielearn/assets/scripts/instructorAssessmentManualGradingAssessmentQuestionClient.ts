import { onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';
import { escapeHtml, html } from '@prairielearn/html';

import { EditQuestionPointsScoreForm } from '../../src/components/EditQuestionPointsScore.html.js';
import { User } from '../../src/lib/db-types.js';
import { formatPoints } from '../../src/lib/format.js';

onDocumentReady(() => {
  const {
    hasCourseInstancePermissionEdit,
    urlPrefix,
    assessmentId,
    assessmentQuestionId,
    maxPoints,
    groupWork,
    maxAutoPoints,
  } = document.getElementById('grading-table')?.dataset ?? {};

  // @ts-expect-error The BootstrapTableOptions type does not handle extensions properly
  $('#grading-table').bootstrapTable({
    classes: 'table table-sm table-bordered',
    url: `${urlPrefix}/assessment/${assessmentId}/manual_grading/assessment_question/${assessmentQuestionId}/instances.json`,
    dataField: 'instance_questions',
    escape: true,
    uniqueId: 'id',
    idField: 'id',
    selectItemName: 'instance_question_id',
    showButtonText: true,
    showColumns: true,
    showRefresh: true,
    autoRefresh: true,
    autoRefreshStatus: false,
    autoRefreshInterval: 30,
    buttonsOrder: ['columns', 'refresh', 'autoRefresh', 'showStudentInfo', 'status'],
    theadClasses: 'thead-light',
    stickyHeader: true,
    filterControl: true,
    rowStyle: (row) => (row.requires_manual_grading ? {} : { classes: 'text-muted bg-light' }),
    buttons: {
      showStudentInfo: {
        text: 'Show student info',
        icon: 'fa-eye',
        event: () => {
          const button = document.getElementById('js-show-student-info-button');
          $('#grading-table').bootstrapTable(
            button?.classList.contains('active') ? 'hideColumn' : 'showColumn',
            ['user_or_group_name', 'uid'],
          );
          button?.classList.toggle('active');
        },
        attributes: {
          id: 'js-show-student-info-button',
          title: 'Show/hide student identification information',
        },
      },
      status: {
        text: 'Tag for grading',
        icon: 'fa-tags',
        render: hasCourseInstancePermissionEdit === 'true',
        html: gradingTagDropdown,
      },
    },
    onUncheck: updateGradingTagButton,
    onUncheckAll: updateGradingTagButton,
    onUncheckSome: updateGradingTagButton,
    onCheck: updateGradingTagButton,
    onCheckAll: updateGradingTagButton,
    onCheckSome: updateGradingTagButton,
    onCreatedControls: () => {
      $('#grading-table th[data-field="points"] .filter-control input').tooltip({
        title: `hint: use <code>&lt;${Math.ceil(Number(maxPoints) / 2)}</code>, or <code>&gt;0</code>`,
        html: true,
      });
      $('#grading-table th[data-field="score_perc"] .filter-control input').tooltip({
        title: 'hint: use <code>&lt;50</code>, or <code>&gt;0</code>',
        html: true,
      });
    },
    onPreBody: () => {
      $('#grading-table [data-toggle="popover"]').popover('dispose');
      $('#grading-table [data-toggle="tooltip"]').tooltip('dispose');
    },
    onPostBody: () => {
      updateGradingTagButton();
      $('#grading-table [data-toggle="popover"]').popover({
        sanitize: false,
        content(this: Element) {
          const form = parseHTMLElement<HTMLFormElement>(
            document,
            (this as HTMLElement).dataset.baseContent || '',
          );
          // The content may not be a form if there are rubrics, in that case do nothing.
          if (form.tagName === 'FORM') {
            form.addEventListener('submit', (event) => {
              ajaxSubmit(event);
              $(this).popover('hide');
            });
          }
          return form;
        },
      });
      $('#grading-table [data-toggle=tooltip]').tooltip({ html: true });
    },
    columns: [
      [
        {
          checkbox: true,
        },
        {
          field: 'index',
          title: 'Instance',
          searchable: false,
          sortable: true,
          switchable: false,
          formatter: (_value: any, row: any) =>
            html`<a
                href="${urlPrefix}/assessment/${assessmentId}/manual_grading/instance_question/${row.id}"
              >
                Instance ${row.index}
                ${row.open_issue_count
                  ? html`<span class="badge badge-pill badge-danger">${row.open_issue_count}</span>`
                  : ''}
              </a>
              ${row.assessment_open
                ? html`<span title="Assessment instance is still open" data-toggle="tooltip"
                    ><i class="fas fa-exclamation-triangle text-warning"></i
                  ></span>`
                : ''}`.toString(),
        },
        {
          field: 'user_or_group_name',
          title: groupWork === 'true' ? 'Group Name' : 'Name',
          searchable: true,
          filterControl: 'input',
          sortable: true,
          visible: false,
        },
        {
          field: 'uid',
          title: groupWork === 'true' ? 'UIDs' : 'UID',
          searchable: true,
          filterControl: 'input',
          sortable: true,
          visible: false,
        },
        {
          field: 'requires_manual_grading',
          title: 'Grading status',
          filterControl: 'select',
          sortable: true,
          class: 'text-center',
          formatter: (value: boolean) => (value ? 'Requires grading' : 'Graded'),
        },
        {
          field: 'assigned_grader',
          title: 'Assigned grader',
          filterControl: 'select',
          formatter: (_value: string, row: any) => row.assigned_grader_name || '—',
        },
        {
          field: 'auto_points',
          title: 'Auto points',
          class: 'text-center',
          filterControl: 'input',
          visible: Number(maxAutoPoints) > 0,
          searchFormatter: false,
          sortable: true,
          formatter: pointsFormatter,
        },
        {
          field: 'manual_points',
          title: 'Manual points',
          class: 'text-center',
          filterControl: 'input',
          visible: true,
          searchFormatter: false,
          sortable: true,
          formatter: pointsFormatter,
        },
        {
          field: 'points',
          title: 'Total points',
          class: 'text-center',
          filterControl: 'input',
          visible: false,
          searchFormatter: false,
          sortable: true,
          formatter: pointsFormatter,
        },
        {
          field: 'score_perc',
          title: 'Percentage score',
          class: 'text-center align-middle text-nowrap',
          filterControl: 'input',
          searchFormatter: false,
          sortable: true,
          formatter: scorebarFormatter,
        },
        {
          field: 'last_grader',
          title: 'Graded by',
          filterControl: 'select',
          formatter: (value: string, row: any) => (value ? row.last_grader_name : '&mdash;'),
        },
      ],
    ],
  });
});

function ajaxSubmit(e: any) {
  e.preventDefault();
  const submitter = e.submitter || e.originalEvent?.submitter;
  if (submitter) {
    // Obtain information from submit button that was used
    $(e.target)
      .find('input[name=batch_action_data]')
      .val(JSON.stringify($(submitter).data('batch-action') || {}));
  }
  $.post(
    $(e.target).attr('action') ?? '',
    $(e.target).serialize(),
    function (data) {
      if (data.conflict_grading_job_id) {
        $('#grading-conflict-modal')
          .find('a.conflict-details-link')
          .attr('href', data.conflict_details_url);
        $('#grading-conflict-modal').modal({});
      }
      $('#grading-table').bootstrapTable('refresh');
    },
    'json',
  ).fail(function () {
    // TODO Better user notification of update failure
  });
}

function gradingTagDropdown() {
  const courseStaff: User[] =
    JSON.parse(document.getElementById('grading-table')?.dataset.courseStaff ?? '[]') || [];

  return html`
    <div class="dropdown btn-group">
      <button
        class="btn btn-secondary dropdown-toggle grading-tag-button"
        data-toggle="dropdown"
        name="status"
        disabled
      >
        <i class="fas fa-tags"></i> Tag for grading
      </button>
      <div class="dropdown-menu dropdown-menu-right">
        <div class="dropdown-header">Assign for grading</div>
        ${courseStaff.map(
          (grader) => html`
            <button
              class="dropdown-item"
              type="submit"
              data-batch-action="${JSON.stringify({
                requires_manual_grading: true,
                assigned_grader: grader.user_id,
              })}"
            >
              <i class="fas fa-user-tag"></i>
              Assign to: ${grader.name || ''} (${grader.uid})
            </button>
          `,
        )}
        <button
          class="dropdown-item"
          type="submit"
          data-batch-action="${JSON.stringify({ assigned_grader: null })}"
        >
          <i class="fas fa-user-slash"></i>
          Remove grader assignment
        </button>
        <div class="dropdown-divider"></div>
        <button
          class="dropdown-item"
          type="submit"
          data-batch-action="${JSON.stringify({ requires_manual_grading: true })}"
        >
          <i class="fas fa-tag"></i>
          Tag as required grading
        </button>
        <button
          class="dropdown-item"
          type="submit"
          data-batch-action="${JSON.stringify({ requires_manual_grading: false })}"
        >
          <i class="fas fa-check-square"></i>
          Tag as graded
        </button>
      </div>
    </div>
  `.toString();
}

function updateGradingTagButton() {
  $('.grading-tag-button').prop(
    'disabled',
    !$('#grading-table').bootstrapTable('getSelections').length,
  );
}

function pointsFormatter(
  points: string,
  row: any,
  _index: number,
  field: 'manual_points' | 'auto_points' | 'points',
) {
  const { hasCourseInstancePermissionEdit, assessmentId, manualRubricId, urlPrefix, csrfToken } =
    document.getElementById('grading-table')?.dataset ?? {};
  const maxPoints =
    field === 'manual_points'
      ? row.max_manual_points
      : field === 'auto_points'
        ? row.max_auto_points
        : field === 'points'
          ? row.max_points
          : 0;
  const buttonId = `editQuestionPoints_${field}_${row.id}`;

  const editForm = EditQuestionPointsScoreForm({
    field,
    pointsOrScore: Number(points),
    maxPoints,
    instanceQuestionId: row.id,
    assessmentId: assessmentId ?? '',
    rubricId: manualRubricId ?? '',
    modifiedAt: row.modified_at,
    urlPrefix: urlPrefix ?? '',
    csrfToken: csrfToken ?? '',
    popoverId: buttonId,
  });

  return html`${formatPoints(Number(points))}
    <small>/<span class="text-muted">${maxPoints}</span></small>
    ${hasCourseInstancePermissionEdit === 'true'
      ? html`<button
          type="button"
          class="btn btn-xs btn-secondary"
          id="${buttonId}"
          data-toggle="popover"
          data-container="body"
          data-html="true"
          data-placement="auto"
          title="Change question points"
          data-base-content="${escapeHtml(editForm)}"
        >
          <i class="fa fa-edit" aria-hidden="true"></i>
        </button>`
      : ''}`;
}

function scorebarFormatter(score: number | null, row: any) {
  const { hasCourseInstancePermissionEdit, assessmentId, manualRubricId, urlPrefix, csrfToken } =
    document.getElementById('grading-table')?.dataset ?? {};
  const buttonId = `editQuestionScorePerc${row.id}`;

  const editForm = EditQuestionPointsScoreForm({
    field: 'score_perc',
    pointsOrScore: Number(score),
    instanceQuestionId: row.id,
    assessmentId: assessmentId ?? '',
    rubricId: manualRubricId ?? '',
    modifiedAt: row.modified_at,
    urlPrefix: urlPrefix ?? '',
    csrfToken: csrfToken ?? '',
    popoverId: buttonId,
  });

  return html`<div class="d-inline-block align-middle">
      ${score == null
        ? ''
        : html`<div class="progress bg" style="min-width: 10em; max-width: 20em;">
            <div
              class="progress-bar bg-success"
              style="width: ${Math.floor(Math.min(100, score))}%"
            >
              ${score >= 50 ? `${Math.floor(score)}%` : ''}
            </div>
            <div
              class="progress-bar bg-danger"
              style="width: ${100 - Math.floor(Math.min(100, score))}%"
            >
              ${score >= 50 ? '' : `${Math.floor(score)}%`}
            </div>
          </div>`}
    </div>
    ${hasCourseInstancePermissionEdit === 'true'
      ? html`<button
          type="button"
          class="btn btn-xs btn-secondary"
          id="${buttonId}"
          data-toggle="popover"
          data-container="body"
          data-html="true"
          data-placement="auto"
          title="Change question percentage score"
          data-base-content="${escapeHtml(editForm)}"
        >
          <i class="fa fa-edit" aria-hidden="true"></i>
        </button>`
      : ''}`.toString();
}
