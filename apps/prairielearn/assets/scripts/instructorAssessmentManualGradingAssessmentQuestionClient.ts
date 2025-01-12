import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { EditQuestionPointsScoreButton } from '../../src/components/EditQuestionPointsScore.html.js';
import { Scorebar } from '../../src/components/Scorebar.html.js';
import { type User } from '../../src/lib/db-types.js';
import { formatPoints } from '../../src/lib/format.js';
import type {
  InstanceQuestionRow,
  InstanceQuestionTableData,
} from '../../src/pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.types.js';

type InstanceQuestionRowWithIndex = InstanceQuestionRow & { index: number };

onDocumentReady(() => {
  const {
    hasCourseInstancePermissionEdit,
    urlPrefix,
    instancesUrl,
    groupWork,
    maxAutoPoints,
    aiGradingEnabled,
    courseStaff,
    csrfToken,
  } = decodeData<InstanceQuestionTableData>('instance-question-table-data');

  document.querySelectorAll<HTMLFormElement>('form[name=grading-form]').forEach((form) => {
    form.addEventListener('submit', ajaxSubmit);
  });

  // @ts-expect-error The BootstrapTableOptions type does not handle extensions properly
  $('#grading-table').bootstrapTable({
    // TODO: If we can pick up the following change, we can drop the `icons` config here:
    // https://github.com/wenzhixin/bootstrap-table/pull/7190
    iconsPrefix: 'fa',
    icons: {
      refresh: 'fa-sync',
      autoRefresh: 'fa-clock',
      columns: 'fa-table-list',
    },

    classes: 'table table-sm table-bordered',
    url: instancesUrl,
    responseHandler: (res: { instance_questions: InstanceQuestionRow[] }) =>
      // Add a stable, user-friendly index that is used to identify an instance
      // question anonymously but retain its value in case of sorting/filters
      res.instance_questions.map((row, index) => ({ ...row, index })),
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
    buttonsOrder: ['columns', 'refresh', 'autoRefresh', 'showStudentInfo', 'status', 'aiGrade'],
    theadClasses: 'thead-light',
    stickyHeader: true,
    filterControl: true,
    rowStyle: (row) => (row.requires_manual_grading ? {} : { classes: 'text-muted bg-light' }),
    buttons: {
      aiGrade: {
        text: 'AI Grade All',
        icon: 'fa-pen',
        render: aiGradingEnabled,
        attributes: {
          id: 'js-ai-grade-button',
          title: 'AI grade all instances',
        },
        event: () => {
          const form = document.getElementById('ai-grading') as HTMLFormElement;
          form?.submit();
        },
      },
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
        render: hasCourseInstancePermissionEdit,
        html: () => gradingTagDropdown(courseStaff),
      },
    },
    onUncheck: updateGradingTagButton,
    onUncheckAll: updateGradingTagButton,
    onUncheckSome: updateGradingTagButton,
    onCheck: updateGradingTagButton,
    onCheckAll: updateGradingTagButton,
    onCheckSome: updateGradingTagButton,
    onCreatedControls: () => {
      $('#grading-table th[data-field="auto_points"] .filter-control input').tooltip({
        title: 'hint: use <code>&lt;1</code>, or <code>&gt;0</code>',
        html: true,
      });

      $('#grading-table th[data-field="manual_points"] .filter-control input').tooltip({
        title: 'hint: use <code>&lt;1</code>, or <code>&gt;0</code>',
        html: true,
      });

      // This column is hidden by default, but can be shown by the user.
      $('#grading-table th[data-field="points"] .filter-control input').tooltip({
        title: 'hint: use <code>&lt;1</code>, or <code>&gt;0</code>',
        html: true,
      });

      $('#grading-table th[data-field="score_perc"] .filter-control input').tooltip({
        title: 'hint: use <code>&lt;50</code>, or <code>&gt;0</code>',
        html: true,
      });
    },
    onPreBody: () => {
      $('#grading-table [data-toggle="popover"]').popover('dispose');
    },
    onPostBody: () => {
      updateGradingTagButton();
      $('#grading-table [data-toggle="popover"]').on(
        'shown.bs.popover',
        updatePointsPopoverHandlers,
      );
    },
    columns: [
      [
        { checkbox: true },
        {
          field: 'index',
          title: 'Instance',
          searchable: false,
          sortable: true,
          switchable: false,
          formatter: (_value: number, row: InstanceQuestionRowWithIndex) =>
            html`
              <a
                href="${urlPrefix}/assessment/${row.assessment_question
                  .assessment_id}/manual_grading/instance_question/${row.id}"
                >Instance ${row.index + 1}</a
              >
              ${row.open_issue_count
                ? html`
                    <a
                      href="#"
                      class="badge badge-pill badge-danger"
                      title="Instance question has ${row.open_issue_count} open ${row.open_issue_count >
                      1
                        ? 'issues'
                        : 'issue'}"
                      data-toggle="tooltip"
                    >
                      ${row.open_issue_count}
                    </a>
                  `
                : ''}
              ${row.assessment_open
                ? html`
                    <a href="#" title="Assessment instance is still open" data-toggle="tooltip">
                      <i class="fas fa-exclamation-triangle text-warning"></i>
                    </a>
                  `
                : ''}
            `.toString(),
        },
        {
          field: 'user_or_group_name',
          title: groupWork ? 'Group Name' : 'Name',
          searchable: true,
          filterControl: 'input',
          sortable: true,
          visible: false,
        },
        {
          field: 'uid',
          title: groupWork ? 'UIDs' : 'UID',
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
          formatter: (_value: string, row: InstanceQuestionRow) => row.assigned_grader_name || '—',
        },
        {
          field: 'auto_points',
          title: 'Auto points',
          class: 'text-center',
          filterControl: 'input',
          visible: (maxAutoPoints ?? 0) > 0,
          searchFormatter: false,
          sortable: true,
          formatter: (points: number | null, row: InstanceQuestionRow) =>
            pointsFormatter(
              row,
              'auto_points',
              hasCourseInstancePermissionEdit,
              urlPrefix,
              csrfToken,
            ),
        },
        {
          field: 'manual_points',
          title: 'Manual points',
          class: 'text-center',
          filterControl: 'input',
          visible: true,
          searchFormatter: false,
          sortable: true,
          formatter: (points: number | null, row: InstanceQuestionRow) =>
            pointsFormatter(
              row,
              'manual_points',
              hasCourseInstancePermissionEdit,
              urlPrefix,
              csrfToken,
            ),
        },
        {
          field: 'points',
          title: 'Total points',
          class: 'text-center',
          filterControl: 'input',
          visible: false,
          searchFormatter: false,
          sortable: true,
          formatter: (points: number | null, row: InstanceQuestionRow) =>
            pointsFormatter(row, 'points', hasCourseInstancePermissionEdit, urlPrefix, csrfToken),
        },
        {
          field: 'score_perc',
          title: 'Percentage score',
          class: 'text-center align-middle text-nowrap',
          filterControl: 'input',
          searchFormatter: false,
          sortable: true,
          formatter: (score: number | null, row: InstanceQuestionRow) =>
            scorebarFormatter(score, row, hasCourseInstancePermissionEdit, urlPrefix, csrfToken),
        },
        {
          field: 'last_grader',
          title: 'Graded by',
          filterControl: 'select',
          formatter: (value: string, row: InstanceQuestionRow) =>
            value ? row.last_grader_name : '&mdash;',
        },
      ],
    ],
  });
});

async function ajaxSubmit(this: HTMLFormElement, e: SubmitEvent) {
  e.preventDefault();

  const postBody = new URLSearchParams(
    // https://github.com/microsoft/TypeScript/issues/30584
    new FormData(this, e.submitter) as any,
  );

  const response = await fetch(this.action, { method: 'POST', body: postBody }).catch(
    (err) => ({ status: null, statusText: err.toString() }) as const,
  );
  if (response.status !== 200) {
    console.error(response.status, response.statusText);
    // TODO Better user notification of update failure
    return null;
  }
  $('#grading-table').bootstrapTable('refresh');
  return await response.json();
}

async function pointsFormEventListener(this: HTMLFormElement, event: SubmitEvent) {
  const data = await ajaxSubmit.call(this, event);
  if (data?.conflict_grading_job_id) {
    $('#grading-conflict-modal')
      .find('a.conflict-details-link')
      .attr('href', data.conflict_details_url);
    $('#grading-conflict-modal').modal('show');
  }
}

function updatePointsPopoverHandlers(this: Element) {
  document.querySelectorAll<HTMLFormElement>('form[name=edit-points-form]').forEach((form) => {
    form.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
    // Ensures that, if two popovers are open at the same time, the event listener is not added twice
    form.removeEventListener('submit', pointsFormEventListener);
    form.addEventListener('submit', pointsFormEventListener);
  });
}

function gradingTagDropdown(courseStaff: User[]) {
  return html`
    <div class="dropdown btn-group">
      <button
        type="button"
        class="btn btn-secondary dropdown-toggle grading-tag-button"
        data-toggle="dropdown"
        name="status"
        disabled
      >
        <i class="fas fa-tags"></i> Tag for grading
      </button>
      <div class="dropdown-menu dropdown-menu-right">
        <div class="dropdown-header">Assign for grading</div>
        ${courseStaff?.map(
          (grader) => html`
            <button
              class="dropdown-item"
              type="submit"
              name="batch_action_data"
              value="${JSON.stringify({
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
          name="batch_action_data"
          value="${JSON.stringify({ assigned_grader: null })}"
        >
          <i class="fas fa-user-slash"></i>
          Remove grader assignment
        </button>
        <div class="dropdown-divider"></div>
        <button
          class="dropdown-item"
          type="submit"
          name="batch_action_data"
          value="${JSON.stringify({ requires_manual_grading: true })}"
        >
          <i class="fas fa-tag"></i>
          Tag as required grading
        </button>
        <button
          class="dropdown-item"
          type="submit"
          name="batch_action_data"
          value="${JSON.stringify({ requires_manual_grading: false })}"
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
  row: InstanceQuestionRow,
  field: 'manual_points' | 'auto_points' | 'points',
  hasCourseInstancePermissionEdit: boolean,
  urlPrefix: string,
  csrfToken: string,
) {
  const points = row[field];
  const maxPoints = row.assessment_question[`max_${field}`];

  return html`${formatPoints(points ?? 0)}
    <small>/<span class="text-muted">${maxPoints ?? 0}</span></small>
    ${hasCourseInstancePermissionEdit
      ? EditQuestionPointsScoreButton({
          field,
          instance_question: row,
          assessment_question: row.assessment_question,
          urlPrefix: urlPrefix ?? '',
          csrfToken: csrfToken ?? '',
        })
      : ''}`;
}

function scorebarFormatter(
  score: number | null,
  row: InstanceQuestionRow,
  hasCourseInstancePermissionEdit: boolean,
  urlPrefix: string,
  csrfToken: string,
) {
  return html`<div class="d-inline-block align-middle">
      ${score == null ? '' : Scorebar(score, { minWidth: '10em' })}
    </div>
    ${hasCourseInstancePermissionEdit
      ? EditQuestionPointsScoreButton({
          field: 'score_perc',
          instance_question: row,
          assessment_question: row.assessment_question,
          urlPrefix: urlPrefix ?? '',
          csrfToken: csrfToken ?? '',
        })
      : ''}`.toString();
}
