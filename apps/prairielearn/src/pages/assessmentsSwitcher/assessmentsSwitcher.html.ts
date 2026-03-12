import { html } from '@prairielearn/html';

import { AssessmentModuleHeadingHtml } from '../../components/AssessmentModuleHeading.js';
import { AssessmentSetHeadingHtml } from '../../components/AssessmentSetHeading.js';
import { IssueBadgeHtml } from '../../components/IssueBadge.js';
import type { NavSubPage } from '../../components/Navbar.types.js';
import { SyncProblemButtonHtml } from '../../components/SyncProblemButton.js';
import type { QuestionAssessment } from '../../lib/assessment-question-context.js';
import { idsEqual } from '../../lib/id.js';
import type { AssessmentRow } from '../../models/assessment.js';

export function AssessmentSwitcher({
  assessmentRows,
  assessmentsGroupBy,
  currentAssessmentId,
  courseInstanceId,
  targetSubPage,
}: {
  assessmentRows: AssessmentRow[];
  assessmentsGroupBy: 'Set' | 'Module';
  currentAssessmentId: string;
  courseInstanceId: string;
  /** The subPage that assessment links should redirect to. */
  targetSubPage?: NavSubPage;
}) {
  return html`
    <div id="assessment-switcher-container" class="d-flex flex-column">
      ${assessmentRows.map((row, index) => {
        const assessmentUrl = `/pl/course_instance/${courseInstanceId}/instructor/assessment/${row.id}/${targetSubPage ?? ''}`;

        const isActive = idsEqual(currentAssessmentId, row.id);

        return html`
          ${row.start_new_assessment_group
            ? html`
                <div class="fw-bold ${index === 0 ? 'mt-0' : 'mt-3'}">
                  ${assessmentsGroupBy === 'Set'
                    ? AssessmentSetHeadingHtml({ assessment_set: row.assessment_set })
                    : AssessmentModuleHeadingHtml({
                        assessment_module: row.assessment_module,
                      })}
                </div>
              `
            : ''}
          <div
            class="assessment-row column-gap-2 p-2 mt-1 gap-md-1 p-md-1 w-100 rounded ${isActive
              ? 'bg-primary text-white'
              : ''}"
          >
            <div class="d-flex align-items-center">
              <span
                class="badge overflow-hidden text-truncate text-nowrap color-${row.assessment_set
                  .color}"
              >
                ${row.label}
              </span>
            </div>
            <div class="title">
              ${row.sync_errors
                ? SyncProblemButtonHtml({
                    type: 'error',
                    output: row.sync_errors,
                  })
                : row.sync_warnings
                  ? SyncProblemButtonHtml({
                      type: 'warning',
                      output: row.sync_warnings,
                    })
                  : ''}
              <a href="${assessmentUrl}" class="${isActive ? 'text-white' : ''}">
                ${row.title}
                ${row.team_work ? html` <i class="fas fa-users" aria-hidden="true"></i> ` : ''}
              </a>
              ${IssueBadgeHtml({
                count: row.open_issue_count,
                urlPrefix: `/pl/course_instance/${courseInstanceId}/instructor`,
                issueAid: row.tid,
              })}
            </div>
            <div class="d-flex overflow-hidden align-items-center ${isActive ? '' : 'text-muted'}">
              <!-- Use RTL so the overflow is on the left, but with an inner span with auto direction so it doesn't affect the text itself -->
              <span class="text-nowrap text-truncate text-start" dir="rtl">
                <span dir="auto">${row.tid}</span>
              </span>
            </div>
          </div>
        `;
      })}
    </div>
  `.toString();
}

interface CourseInstanceAssessmentEntry {
  courseInstance: { id: string; short_name: string | null };
  assessments: QuestionAssessment[];
}

function QuestionAssessmentRows({
  assessments,
  courseInstanceId,
  questionId,
  currentAssessmentQuestionId,
}: {
  assessments: QuestionAssessment[];
  courseInstanceId: string;
  questionId: string;
  currentAssessmentQuestionId?: string;
}) {
  return assessments.map((row) => {
    const questionUrl = `/pl/course_instance/${courseInstanceId}/instructor/question/${questionId}/preview?assessment_question_id=${row.assessment_question_id}`;
    const isActive =
      currentAssessmentQuestionId != null &&
      idsEqual(currentAssessmentQuestionId, row.assessment_question_id);

    return html`
      <div
        class="assessment-row column-gap-2 p-2 mt-1 gap-md-1 p-md-1 w-100 rounded ${isActive
          ? 'bg-primary text-white'
          : ''}"
      >
        <div class="d-flex align-items-center">
          <span
            class="badge overflow-hidden text-truncate text-nowrap color-${row.assessment_set
              .color}"
          >
            ${row.label}
          </span>
        </div>
        <div class="title">
          <a href="${questionUrl}" class="${isActive ? 'text-white' : ''}">${row.title}</a>
        </div>
        <div class="d-flex overflow-hidden align-items-center ${isActive ? '' : 'text-muted'}">
          <span class="text-nowrap text-truncate text-start" dir="rtl">
            <span dir="auto">${row.tid}</span>
          </span>
        </div>
      </div>
    `;
  });
}

export function QuestionAssessmentSwitcherWithTabs({
  courseInstanceAssessments,
  courseId,
  questionId,
  currentCourseInstanceId,
  currentAssessmentQuestionId,
}: {
  courseInstanceAssessments: CourseInstanceAssessmentEntry[];
  courseId: string;
  questionId: string;
  currentCourseInstanceId?: string;
  currentAssessmentQuestionId?: string;
}) {
  const questionBankUrl = `/pl/course/${courseId}/question/${questionId}/preview`;

  if (courseInstanceAssessments.length === 0) {
    return html`
      <div class="d-flex flex-column">
        <div class="text-muted text-center py-3">This question is not used in any assessments.</div>
        <hr class="my-1" />
        <a href="${questionBankUrl}" class="p-2 rounded text-decoration-none">
          <i class="bi bi-x-circle me-1"></i> View in question bank
        </a>
      </div>
    `.toString();
  }

  if (courseInstanceAssessments.length === 1) {
    const entry = courseInstanceAssessments[0];
    return html`
      <div id="assessment-switcher-container" class="d-flex flex-column">
        ${QuestionAssessmentRows({
          assessments: entry.assessments,
          courseInstanceId: entry.courseInstance.id,
          questionId,
          currentAssessmentQuestionId,
        })}
        <hr class="my-1" />
        <a
          href="${questionBankUrl}"
          class="p-2 rounded text-decoration-none ${!currentAssessmentQuestionId ? 'fw-bold' : ''}"
        >
          <i class="bi bi-x-circle me-1"></i> View in question bank
        </a>
      </div>
    `.toString();
  }

  const activeTabId =
    courseInstanceAssessments.find((entry) =>
      currentCourseInstanceId ? idsEqual(entry.courseInstance.id, currentCourseInstanceId) : false,
    )?.courseInstance.id ?? courseInstanceAssessments[0].courseInstance.id;

  return html`
    <div id="assessment-switcher-container" class="d-flex flex-column">
      <ul class="nav nav-tabs mb-2" role="tablist">
        ${courseInstanceAssessments.map((entry) => {
          const isActive = idsEqual(entry.courseInstance.id, activeTabId);
          return html`
            <li class="nav-item" role="presentation">
              <button
                class="nav-link ${isActive ? 'active' : ''}"
                data-bs-toggle="tab"
                data-bs-target="#ci-tab-${entry.courseInstance.id}"
                type="button"
                role="tab"
                aria-selected="${isActive ? 'true' : 'false'}"
              >
                ${entry.courseInstance.short_name}
              </button>
            </li>
          `;
        })}
      </ul>
      <div class="tab-content">
        ${courseInstanceAssessments.map((entry) => {
          const isActive = idsEqual(entry.courseInstance.id, activeTabId);
          return html`
            <div
              class="tab-pane ${isActive ? 'show active' : ''}"
              id="ci-tab-${entry.courseInstance.id}"
              role="tabpanel"
            >
              ${QuestionAssessmentRows({
                assessments: entry.assessments,
                courseInstanceId: entry.courseInstance.id,
                questionId,
                currentAssessmentQuestionId: idsEqual(entry.courseInstance.id, activeTabId)
                  ? currentAssessmentQuestionId
                  : undefined,
              })}
            </div>
          `;
        })}
      </div>
      <hr class="my-1" />
      <a
        href="${questionBankUrl}"
        class="p-2 rounded text-decoration-none ${!currentAssessmentQuestionId ? 'fw-bold' : ''}"
      >
        <i class="bi bi-x-circle me-1"></i> View in question bank
      </a>
    </div>
  `.toString();
}
