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

declare global {
  interface Window {
    gradersList: () => any;
    rubricItemsList: () => any;
  }
}

onDocumentReady(() => {
  const {
    hasCourseInstancePermissionEdit,
    urlPrefix,
    instancesUrl,
    groupWork,
    maxAutoPoints,
    aiGradingEnabled,
    aiGradingMode,
    courseStaff,
    csrfToken,
  } = decodeData<InstanceQuestionTableData>('instance-question-table-data');

  document.querySelectorAll<HTMLFormElement>('form[name=grading-form]').forEach((form) => {
    form.addEventListener('submit', ajaxSubmit);
  });

  window.gradersList = function () {
    const data = $('#grading-table').bootstrapTable('getData') as InstanceQuestionRow[];

    return Object.fromEntries(
      data
        .flatMap((row) =>
          (row.ai_graded ? [generateAiGraderName(row.ai_graded_with_latest_rubric)] : []).concat(
            row.last_human_grader ? [row.last_human_grader] : [],
          ),
        )
        .map((name) => [name, name]),
    );
  };

  window.rubricItemsList = function () {
    const data = $('#grading-table').bootstrapTable('getData') as InstanceQuestionRow[];

    return Object.fromEntries(
      data
        .flatMap((row) =>
          row.rubric_difference ? row.rubric_difference.map((item) => item.description) : [],
        )
        .map((name) => [name, name]),
    );
  };

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
    buttonsOrder: [
      'columns',
      'refresh',
      'autoRefresh',
      'showStudentInfo',
      'status',
      'toggleAiGradingMode',
      'aiGrade',
    ],
    theadClasses: 'table-light',
    stickyHeader: true,
    filterControl: true,
    rowStyle: (row) => (row.requires_manual_grading ? {} : { classes: 'text-muted bg-light' }),
    buttons: {
      aiGrade: {
        render: aiGradingEnabled,
        attributes: {
          id: 'js-ai-grade-button',
          title: 'AI grading',
        },
        html: aiGradingDropdown(),
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
      toggleAiGradingMode: {
        render: aiGradingEnabled,
        html: html`<button
          class="btn btn-secondary ${aiGradingMode ? 'active' : ''}"
          type="button"
          name="toggleAiGradingMode"
          id="js-toggle-ai-grading-mode-button"
          title="Start/stop AI grading mode"
        >
          <i class="fa fa-eye" aria-hidden="true"></i> AI grading mode
        </button>`.toString(),
        event: () => {
          $('#ai-grading-mode').trigger('submit');
        },
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
      $('#grading-table [data-bs-toggle="popover"]').popover('dispose');
    },
    onPostBody: () => {
      updateGradingTagButton();
      $('#grading-table [data-bs-toggle="popover"]').on(
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
                      class="badge rounded-pill text-bg-danger"
                      data-bs-toggle="tooltip"
                      data-bs-title="Instance question has ${row.open_issue_count} open ${row.open_issue_count >
                      1
                        ? 'issues'
                        : 'issue'}"
                    >
                      ${row.open_issue_count}
                    </a>
                  `
                : ''}
              ${row.assessment_open
                ? html`
                    <a
                      href="#"
                      data-bs-toggle="tooltip"
                      data-bs-title="Assessment instance is still open"
                    >
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
          visible: !aiGradingMode,
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
          visible: !aiGradingMode,
        },
        {
          field: 'last_grader',
          title: 'Graded by',
          visible: !aiGradingMode,
          filterControl: 'select',
          filterCustomSearch: (text: string, value: string) => {
            if (text === generateAiGraderName().toLowerCase()) {
              return value.includes('js-custom-search-ai-grading');
            }
            return null;
          },
          formatter: (value: string, row: InstanceQuestionRow) =>
            value
              ? row.is_ai_graded
                ? html`
                    <span class="badge text-bg-secondary js-custom-search-ai-grading"
                      >${generateAiGraderName()}</span
                    >
                  `.toString()
                : row.last_grader_name
              : '&mdash;',
        },
        aiGradingEnabled
          ? {
              field: 'ai_graded',
              title: 'Graded by',
              visible: aiGradingMode,
              filterControl: 'select',
              formatter: (value: boolean, row: InstanceQuestionRow) =>
                html`${row.ai_graded
                  ? html`<span
                      class="badge text-bg-secondary ${row.ai_graded_with_latest_rubric
                        ? 'js-custom-search-ai-grading-latest-rubric'
                        : 'js-custom-search-ai-grading-nonlatest-rubric'}"
                      >${generateAiGraderName(row.ai_graded_with_latest_rubric)}</span
                    >`
                  : ''}
                ${row.last_human_grader ? html`<span>${row.last_human_grader}</span>` : ''}`.toString(),
              filterData: 'func:gradersList',
              filterCustomSearch: (text: string, value: string) => {
                if (text === generateAiGraderName(true).toLowerCase()) {
                  return value.includes('js-custom-search-ai-grading-latest-rubric');
                } else if (text === generateAiGraderName(false).toLowerCase()) {
                  return value.includes('js-custom-search-ai-grading-nonlatest-rubric');
                } else {
                  return value.toLowerCase().includes(text);
                }
              },
            }
          : null,
        aiGradingEnabled
          ? {
              field: 'rubric_difference',
              title: 'Agreement',
              visible: aiGradingMode,
              filterControl: 'select',
              formatter: (value: boolean, row: InstanceQuestionRow) =>
                row.point_difference === null // missing grade from human and/or AI
                  ? '&mdash;'
                  : row.rubric_difference === null // not graded by rubric from human and/or AI
                    ? html`<div>Point difference: ${row.point_difference}</div> `.toString()
                    : html`<div>
                          Rubric difference
                          ${row.ai_graded_with_latest_rubric // AI using outdated rubric
                            ? ''
                            : ' (outdated)'}:
                        </div>
                        ${!row.rubric_difference.length
                          ? html`<i class="fa fa-check" aria-hidden="true"></i>`
                          : row.rubric_difference.map(
                              (item) =>
                                html`<div>
                                  <i class="fa fa-times" aria-hidden="true"></i> ${item.description}
                                </div>`,
                            )}`.toString(),
              filterData: 'func:rubricItemsList',
              filterCustomSearch: (text: string, value: string) =>
                value
                  .toLowerCase()
                  .includes(
                    html`<i class="fa fa-times" aria-hidden="true"></i> ${text}`.toString(),
                  ),
              sortable: true,
              sorter: (
                fieldA: string,
                fieldB: string,
                rowA: InstanceQuestionRow,
                rowB: InstanceQuestionRow,
              ) => {
                if (rowB.point_difference === null) {
                  return -1;
                }
                if (rowA.point_difference === null) {
                  return 1;
                }
                if (rowA.point_difference < rowB.point_difference) {
                  return -1;
                } else if (rowA.point_difference > rowB.point_difference) {
                  return 1;
                } else {
                  return 0;
                }
              },
            }
          : null,
      ].filter(Boolean),
    ],
  });
});

function generateAiGraderName(ai_graded_with_latest_rubric?: boolean | null): string {
  return (
    'AI' +
    (ai_graded_with_latest_rubric === undefined ||
    ai_graded_with_latest_rubric === null ||
    ai_graded_with_latest_rubric
      ? ''
      : ' (outdated)')
  );
}

async function ajaxSubmit(this: HTMLFormElement, e: SubmitEvent) {
  const formData = new FormData(this, e.submitter);

  // Access specific values from the form data (or other fields)
  const action = formData.get('__action');
  const batchAction = formData.get('batch_action');

  if (action === 'batch_action' && batchAction === 'ai_grade_assessment_selected') {
    // We'll handle this with a normal form submission since it redirects to another page.
    return;
  }

  e.preventDefault();

  const postBody = new URLSearchParams(
    // https://github.com/microsoft/TypeScript/issues/30584
    formData as any,
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

function aiGradingDropdown() {
  return html`
    <div class="dropdown btn-group">
      <button
        type="button"
        class="btn btn-secondary dropdown-toggle"
        data-bs-toggle="dropdown"
        name="ai-grading"
      >
        <i class="fa fa-pen" aria-hidden="true"></i> AI grading
      </button>
      <div class="dropdown-menu dropdown-menu-end">
        <button class="dropdown-item" type="button" onclick="$('#ai-grading').submit();">
          Grade all ungraded
        </button>
        <button
          class="dropdown-item grading-tag-button"
          type="submit"
          name="batch_action"
          value="ai_grade_assessment_selected"
        >
          Grade selected
        </button>
        <button class="dropdown-item" type="button" onclick="$('#ai-grading-test').submit();">
          Test accuracy
        </button>
      </div>
    </div>
  `.toString();
}

function gradingTagDropdown(courseStaff: User[]) {
  return html`
    <div class="dropdown btn-group">
      <button
        type="button"
        class="btn btn-secondary dropdown-toggle grading-tag-button"
        data-bs-toggle="dropdown"
        name="status"
        disabled
      >
        <i class="fas fa-tags"></i> Tag for grading
      </button>
      <div class="dropdown-menu dropdown-menu-end">
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
