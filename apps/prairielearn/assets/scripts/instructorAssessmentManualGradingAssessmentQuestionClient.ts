import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';
import { html, joinHtml } from '@prairielearn/html';

import { EditQuestionPointsScoreButton } from '../../src/components/EditQuestionPointsScore.html.js';
import { Scorebar } from '../../src/components/Scorebar.html.js';
import { formatPoints } from '../../src/lib/format.js';
import type {
  InstanceQuestionRowWithAIGradingStats,
  InstanceQuestionTableData,
} from '../../src/pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.types.js';

type InstanceQuestionRow = InstanceQuestionRowWithAIGradingStats;
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
    aiGradingMode,
    csrfToken,
  } = decodeData<InstanceQuestionTableData>('instance-question-table-data');

  document.querySelectorAll<HTMLFormElement>('form[name=grading-form]').forEach((form) => {
    form.addEventListener('submit', ajaxSubmit);
  });

  window.gradersList = function () {
    const data = $('#grading-table').bootstrapTable('getData') as InstanceQuestionRow[];
    const graders = data.flatMap((row) =>
      (row.ai_grading_status !== 'None'
        ? [generateAiGraderName(row.ai_grading_status)]
        : []
      ).concat(row.last_human_grader ? [row.last_human_grader] : []),
    );
    const aiGraders = graders.filter(
      (value) =>
        value === generateAiGraderName('LatestRubric') ||
        value === generateAiGraderName('OutdatedRubric'),
    );
    aiGraders.sort();
    const humanGraders = graders.filter(
      (value) =>
        value !== generateAiGraderName('LatestRubric') &&
        value !== generateAiGraderName('OutdatedRubric'),
    );
    humanGraders.sort();
    return Object.fromEntries(aiGraders.concat(humanGraders).map((name) => [name, name]));
  };

  window.rubricItemsList = function () {
    const data = $('#grading-table').bootstrapTable('getData') as InstanceQuestionRow[];
    const rubricItems = data.flatMap((row) => row.rubric_difference ?? []);
    rubricItems.sort((a, b) => a.number - b.number);
    return Object.fromEntries(rubricItems.map((item) => [item.description, item.description]));
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
    // The way that `bootstrap-table` applies options over defaults is bad: when combining
    // arrays, it treats them as objects with keys and merges them. So, if the default
    // is [1, 2, 3], and the user sets [4], the end result is [4, 2, 3].
    //
    // The default for `buttonsOrder` has 5 elements. To avoid an extra button being shown,
    // we put a dummy element at the end of the array. This won't be rendered, as any button
    // keys that aren't recognized are silently skipped.
    //
    // Another bit of insane behavior from `bootstrap-table`? Who would have thought!
    buttonsOrder: ['columns', 'refresh', 'autoRefresh', 'showStudentInfo', 'not-a-real-button'],
    theadClasses: 'table-light',
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
        aiGradingMode
          ? {
              field: 'ai_graded',
              title: 'Graded by',
              filterControl: 'select',
              formatter: (value: boolean, row: InstanceQuestionRow) => {
                const showPlus = row.ai_grading_status !== 'None' && row.last_human_grader;

                return html`
                  ${row.ai_grading_status !== 'None'
                    ? html`
                        <span
                          class="badge rounded-pill text-bg-light border ${row.ai_grading_status ===
                            'Graded' || row.ai_grading_status === 'LatestRubric'
                            ? 'js-custom-search-ai-grading-latest-rubric'
                            : 'js-custom-search-ai-grading-nonlatest-rubric'}"
                        >
                          ${generateAiGraderName(row.ai_grading_status)}
                        </span>
                      `
                    : ''}
                  ${showPlus ? ' + ' : ''}
                  ${row.last_human_grader ? html`<span>${row.last_human_grader}</span>` : ''}
                `.toString();
              },
              filterData: 'func:gradersList',
              filterCustomSearch: (text: string, value: string) => {
                if (text === generateAiGraderName('LatestRubric').toLowerCase()) {
                  return value.includes('js-custom-search-ai-grading-latest-rubric');
                } else if (text === generateAiGraderName('OutdatedRubric').toLowerCase()) {
                  return value.includes('js-custom-search-ai-grading-nonlatest-rubric');
                } else {
                  return value.toLowerCase().includes(text);
                }
              },
            }
          : {
              field: 'last_grader',
              title: 'Graded by',
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
                        <span
                          class="badge rounded-pill text-bg-light border js-custom-search-ai-grading"
                        >
                          ${generateAiGraderName()}
                        </span>
                      `.toString()
                    : row.last_grader_name
                  : '&mdash;',
            },
        aiGradingMode
          ? {
              field: 'rubric_difference',
              title: 'AI agreement',
              visible: aiGradingMode,
              filterControl: 'select',
              formatter: (_value: unknown, row: InstanceQuestionRow) => {
                if (row.point_difference === null) {
                  // missing grade from human and/or AI
                  return html`&mdash;`.toString();
                }

                if (row.rubric_difference === null) {
                  if (!row.point_difference) {
                    return html`<i class="bi bi-check-square-fill text-success"></i>`.toString();
                  } else {
                    const prefix = row.point_difference < 0 ? '' : '+';
                    return html`<span class="text-danger">
                      <i class="bi bi-x-square-fill"></i>
                      ${prefix}${formatPoints(row.point_difference)}
                    </span>`.toString();
                  }
                }

                if (row.rubric_difference.length === 0) {
                  return html`<i class="bi bi-check-square-fill text-success"></i>`.toString();
                }

                return joinHtml(
                  row.rubric_difference.map(
                    (item) =>
                      html`<div>
                        ${item.false_positive
                          ? html`<i class="bi bi-plus-square-fill text-danger"></i>`
                          : html`<i class="bi bi-dash-square-fill text-danger"></i>`}
                        <span>${item.description}</span>
                      </div>`,
                  ),
                ).toString();
              },
              filterData: 'func:rubricItemsList',
              filterCustomSearch: (text: string, value: string) =>
                value.toLowerCase().includes(html`<span>${text}</span>`.toString()),
              sortable: true,
            }
          : null,
      ].filter(Boolean),
    ],
    customSort: (sortName: string, sortOrder: string, data: InstanceQuestionRow[]) => {
      const order = sortOrder === 'desc' ? -1 : 1;
      if (sortName === 'rubric_difference') {
        data.sort(function (a, b) {
          const a_diff = a['point_difference'] === null ? null : Math.abs(a['point_difference']);
          const b_diff = b['point_difference'] === null ? null : Math.abs(b['point_difference']);
          if (a_diff === null && b_diff === null) {
            // Can't compare if both are null
            return 0;
          } else if (a_diff !== null && b_diff !== null) {
            // Actually sorting based on accuracy
            const a_rubric_diff = a['rubric_difference'] ? a['rubric_difference'].length : null;
            const b_rubric_diff = b['rubric_difference'] ? b['rubric_difference'].length : null;
            if (
              a_rubric_diff !== null &&
              b_rubric_diff !== null &&
              a_rubric_diff !== b_rubric_diff
            ) {
              // Prioritize number of disagreeing items
              return (a_rubric_diff - b_rubric_diff) * order;
            } else {
              // Otherwise sort by point difference
              return (a_diff - b_diff) * order;
            }
          } else if (a_diff !== null) {
            // Make b appear in the end regardless of sort order
            return -1;
          } else {
            // Make a appear in the end regardless of sort order
            return 1;
          }
        });
      } else {
        (data as any[]).sort(function (a, b) {
          if (a[sortName] < b[sortName]) {
            return order * -1;
          } else if (a[sortName] > b[sortName]) {
            return order;
          } else {
            return 0;
          }
        });
      }
    },
  });
});

function generateAiGraderName(
  ai_grading_status?: 'Graded' | 'OutdatedRubric' | 'LatestRubric',
): string {
  return (
    'AI' +
    (ai_grading_status === undefined ||
    ai_grading_status === 'Graded' ||
    ai_grading_status === 'LatestRubric'
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
