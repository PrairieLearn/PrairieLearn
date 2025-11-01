import { decodeData, onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { AssessmentBadgeHtml } from '../../src/components/AssessmentBadge.js';
import { getStudentEnrollmentUrl } from '../../src/lib/client/url.js';
import {
  type AssessmentInstanceScoreResult,
  type GradebookRow,
  type InstructorGradebookData,
} from '../../src/pages/instructorGradebook/instructorGradebook.types.js';

onDocumentReady(() => {
  const { urlPrefix, csvFilename, csrfToken, hasCourseInstancePermissionEdit, courseAssessments } =
    decodeData<InstructorGradebookData>('gradebook-data');

  // @ts-expect-error The BootstrapTableOptions type does not handle extensions properly
  $('#gradebook-table').bootstrapTable({
    // TODO: If we can pick up the following change, we can drop the `icons` config here:
    // https://github.com/wenzhixin/bootstrap-table/pull/7190
    iconsPrefix: 'fa',
    icons: {
      refresh: 'fa-sync',
      columns: 'fa-table-list',
    },

    url: `${urlPrefix}/instance_admin/gradebook/raw_data.json`,
    uniqueId: 'user_id',
    classes: 'table table-sm table-hover table-bordered',
    theadClasses: 'table-light',
    showButtonText: true,
    minimumCountColumns: 0,
    search: true,
    showColumns: true,
    showColumnsToggleAll: true,
    showRefresh: true,
    pagination: true,
    paginationVAlign: 'both',
    paginationHAlign: 'left',
    paginationDetailHAlign: 'right',
    pageList: [10, 20, 50, 100, 200, 500, 'unlimited'],
    pageSize: 50,
    smartDisplay: false,
    showExtendedPagination: true,
    toolbar: '.fixed-table-pagination:nth(0)',
    stickyHeader: true,
    buttons: {
      download: {
        text: 'Download',
        icon: 'fa-download',
        attributes: { title: 'Download gradebook data in CSV format' },
        event: () => {
          window.location.href = `${urlPrefix}/instance_admin/gradebook/${csvFilename}`;
        },
      },
      studentsOnly: {
        text: 'Students Only',
        icon: 'fa-user-graduate',
        attributes: { title: 'List only enrolled students' },
        event: () => {
          const table = $('#gradebook-table');
          const filterOn = !table.data('filter-student-only');
          table.data('filter-student-only', filterOn);

          $('.columns button[name=studentsOnly]').toggleClass('active', filterOn);
          table.bootstrapTable('filterBy', filterOn ? { role: 'Student' } : {});
        },
      },
    },
    onPreBody() {
      document
        .querySelectorAll<HTMLElement>('.spinning-wheel')
        .forEach((el) => (el.style.display = ''));
      $('button.edit-score').popover('hide');
    },
    onPostHeader() {
      document.querySelectorAll<HTMLLinkElement>('#gradebook-table thead a').forEach((el) => {
        el.addEventListener('click', (event) => {
          // It should still be possible to click any link in the header (e.g.,
          // the assessment badges) to go to the link target page, but clicking
          // it should not trigger a sort. While usually the link causes a
          // different page to load (so sorting would be irrelevant), it still
          // affects users Ctrl+clicking the link to open it in a new tab.
          event.stopPropagation();
        });
      });
    },
    onResetView() {
      setupEditScorePopovers(csrfToken);
      document
        .querySelectorAll<HTMLElement>('.spinning-wheel')
        .forEach((el) => (el.style.display = 'none'));
    },
    columns: [
      {
        field: 'uid',
        title: 'UID',
        sortable: true,
        class: 'text-nowrap sticky-column',
        switchable: false,
        escape: true,
      },
      {
        field: 'uin',
        title: 'UIN',
        sortable: true,
        class: 'text-nowrap gradebook-uin',
        formatter: (uin: string | null) => html`${uin ?? ''}`.toString(),
      },
      {
        field: 'user_name',
        title: 'Name',
        sortable: true,
        class: 'text-nowrap',
        formatter: (name: string | null, row: GradebookRow) => {
          if (!name) return '';
          if (!row.enrollment_id) return name;

          return html`
            <a href="${getStudentEnrollmentUrl(urlPrefix, row.enrollment_id)}"> ${name} </a>
          `.toString();
        },
      },
      {
        field: 'role',
        title: html`Role
          <button
            class="btn btn-xs btn-ghost"
            type="button"
            aria-label="Roles help"
            data-bs-toggle="modal"
            data-bs-target="#role-help"
          >
            <i class="bi-question-circle-fill" aria-hidden="true"></i>
          </button>`.toString(),
        sortable: true,
        sortOrder: 'desc',
      },
      ...courseAssessments.map((assessment) => ({
        field: `scores.${assessment.assessment_id}.score_perc`,
        title: AssessmentBadgeHtml({ urlPrefix, assessment }).toString(),
        class: 'text-nowrap',
        searchable: false,
        sortable: true,
        sortOrder: 'desc',
        formatter: (score: number | null, row: GradebookRow) => {
          if (score == null) return '&mdash;';

          const { assessment_instance_id, uid_other_users_group } =
            row.scores[assessment.assessment_id] ?? {};
          if (!assessment_instance_id) return '&mdash;';

          const editButton = hasCourseInstancePermissionEdit
            ? html`
                <button
                  type="button"
                  class="btn btn-xs btn-secondary edit-score ms-1"
                  aria-label="Edit score"
                  data-assessment-instance-id="${assessment_instance_id}"
                  data-score="${score}"
                  data-other-users="${JSON.stringify(uid_other_users_group)}"
                >
                  <i class="bi-pencil-square" aria-hidden="true"></i>
                </button>
              `
            : '';
          return html`
            <a href="${urlPrefix}/assessment_instance/${assessment_instance_id}">
              ${Math.floor(score)}%
            </a>
            ${editButton}
          `.toString();
        },
      })),
    ],
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      const searchInput = document.querySelector<HTMLInputElement>(
        '.fixed-table-toolbar .search input',
      );
      if (searchInput != null && searchInput !== document.activeElement) {
        searchInput.focus();
        event.preventDefault();
      }
    }
  });

  $('[data-bs-toggle="modal"]').click(function (e) {
    e.stopPropagation(); // Keep click from changing sort
    $($(e.currentTarget).data('bs-target')).modal('show');
  });
});

function setupEditScorePopovers(csrfToken: string) {
  $('button.edit-score')
    .popover({
      sanitize: false,
      placement: 'auto',
      container: 'body',
      html: true,
      content(this: Element) {
        const popoverButton = this as HTMLButtonElement;
        const { assessmentInstanceId, score, otherUsers } = popoverButton.dataset;
        const parsedOtherUsers: string[] | undefined = JSON.parse(otherUsers || '[]');
        const form = parseHTMLElement<HTMLFormElement>(
          document,
          html`
            <form name="edit-total-score-perc-form" method="POST">
              <input type="hidden" name="__action" value="edit_total_score_perc" />
              <input type="hidden" name="__csrf_token" value="${csrfToken}" />
              <input type="hidden" name="assessment_instance_id" value="${assessmentInstanceId}" />
              <div class="mb-3">
                <div class="input-group">
                  <input
                    type="text"
                    class="form-control"
                    name="score_perc"
                    value="${score}"
                    aria-label="Score percentage"
                  />
                  <span class="input-group-text">%</span>
                </div>
              </div>
              ${parsedOtherUsers?.length
                ? html`
                    <div class="alert alert-info">
                      <small>
                        This is a group assessment. Updating this grade will also update grades for:
                      </small>
                      <ul>
                        ${parsedOtherUsers.map(
                          (uid: string) => html`<li><small>${uid}</small></li>`,
                        )}
                      </ul>
                    </div>
                  `
                : ''}
              <p>
                <small>
                  This change will be overwritten if further questions are answered by the student.
                </small>
              </p>
              <button type="button" class="btn btn-secondary me-2 js-popover-cancel-button">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary">Change</button>
            </form>
          `,
        );

        form.querySelector('.js-popover-cancel-button')?.addEventListener('click', () => {
          $(popoverButton).popover('hide');
        });

        form.addEventListener('submit', async function (event) {
          event.preventDefault();
          await fetch(form.action, {
            method: 'POST',
            body: new URLSearchParams(new FormData(form, event.submitter) as any),
          }).then(async (response) => {
            const data: AssessmentInstanceScoreResult[] = await response.json();
            data.forEach((score) => {
              $('#gradebook-table').bootstrapTable('updateCellByUniqueId', {
                id: score.user_id,
                field: `scores.${score.assessment_id}.score_perc`,
                value: score.score_perc,
              });
            });
            $(popoverButton).popover('hide');
          });
        });
        return form;
      },
      title: 'Change total percentage score',
      trigger: 'click',
    })
    .on('show.bs.popover', function () {
      $('button.edit-score').not(this).popover('hide');
    });
}
