import { formatInterval } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { User } from '@prairielearn/sentry';

import { config } from '../lib/config.js';
import {
  IntervalSchema,
  type Assessment,
  type AssessmentInstance,
  type Course,
  type CourseInstance,
  type Group,
  type InstanceQuestion,
  type Question,
  type Variant,
} from '../lib/db-types.js';

import { QuestionContext } from './QuestionContainer.types.js';

export function InstructorInfoPanel({
  course,
  course_instance,
  assessment,
  assessment_instance,
  instance_question,
  question,
  variant,
  user,
  instance_group,
  instance_group_uid_list,
  instance_user,
  authz_data,
  question_is_shared,
  questionContext,
  csrfToken,
}: {
  course: Course;
  course_instance?: CourseInstance;
  assessment?: Assessment;
  assessment_instance?: AssessmentInstance & { formatted_date: string };
  instance_question?: InstanceQuestion & {
    assigned_grader_name?: string | null;
    last_grader_name?: string | null;
  };
  question?: Question;
  variant?: Variant & { formatted_date: string };
  user: User;
  instance_group?: Group | null;
  instance_group_uid_list?: string[] | null;
  instance_user?: User | null;
  authz_data: Record<string, any>;
  question_is_shared?: boolean;
  questionContext: QuestionContext;
  csrfToken: string;
}) {
  // Here, we are only checking if the effective user is an instructor. We are not
  // attempting to check if this user has permission to view student data. That check
  // would have already been made (when necessary) before granting access to the page
  // on which this partial is included (an assessment instance or question instance).
  if (
    !authz_data.has_course_permission_preview &&
    !authz_data.has_course_instance_permission_view
  ) {
    return '';
  }

  return html`
    <div class="card mb-4 border-warning">
      <div class="card-header bg-warning">Staff information</div>
      <div class="card-body">
        ${StaffUserInfo({ user })}
        ${InstanceUserInfo({ instance_user, instance_group, instance_group_uid_list })}
        ${QuestionInfo({ course, course_instance, question, variant, question_is_shared })}
        ${VariantInfo({ variant })} ${IssueReportButton({ variant, csrfToken, questionContext })}
        ${AssessmentInstanceInfo({ assessment, assessment_instance })}
        ${ManualGradingInfo({ instance_question, assessment, questionContext })}
      </div>
      <div class="card-footer small">This box is not visible to students.</div>
    </div>
  `;
}

function StaffUserInfo({ user }: { user: User }) {
  return html`
    <h5 class="card-title">Staff user:</h5>
    <div class="d-flex flex-wrap pb-2">
      <div class="pr-1">${user.name}</div>
      <div class="pr-1">${user.uid}</div>
    </div>
  `;
}

function InstanceUserInfo({
  instance_user,
  instance_group,
  instance_group_uid_list,
}: {
  instance_user?: User | null;
  instance_group?: Group | null;
  instance_group_uid_list?: string[] | null;
}) {
  if (instance_user == null && instance_group == null) return '';
  return html`
    <hr />
    <div>
      <details>
        ${instance_group != null
          ? html`
              <summary><h5 class="card-title">Group details</h5></summary>
              <div class="d-flex flex-wrap pb-2">
                <div class="pr-1">${instance_group.name}</div>
                <div class="pr-1">(${instance_group_uid_list?.join(', ')})</div>
              </div>
            `
          : html`
              <summary>
                <h5 class="card-title d-inline-block">Student details</h5>
              </summary>
              <div class="d-flex flex-wrap pb-2">
                <div class="pr-1">${instance_user?.name}</div>
                <div class="pr-1">${instance_user?.uid}</div>
              </div>
            `}
      </details>
    </div>
  `;
}

function QuestionInfo({
  course,
  course_instance,
  question,
  variant,
  question_is_shared,
}: {
  course: Course;
  course_instance?: CourseInstance;
  question?: Question;
  variant?: Variant;
  question_is_shared?: boolean;
}) {
  if (question == null) return '';

  const variantSeedQuery = variant != null ? `?variant_seed=${variant.variant_seed}` : '';
  const instructorUrlPrefix =
    course_instance != null
      ? `${config.urlPrefix}/course_instance/${course_instance.id}/instructor`
      : `${config.urlPrefix}/course/${course.id}`;

  return html`
    <hr />
    <h5 class="card-title">Question:</h5>

    <div class="d-flex flex-wrap">
      <div class="pr-1">QID:</div>
      <div>
        <a href="${instructorUrlPrefix}/question/${question.id}${variantSeedQuery}">
          ${question.qid}
        </a>
      </div>
    </div>

    ${question_is_shared && course.sharing_name
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pr-1">Shared As:</div>
            ${question.shared_publicly
              ? html`
                  <div>
                    <a
                      href="${config.urlPrefix}/public/course/${course.id}/question/${question.id}/preview"
                    >
                      @${course.sharing_name}/${question.qid}
                    </a>
                  </div>
                `
              : html`<div>@${course.sharing_name}/${question.qid}</div>`}
          </div>
        `
      : ''}
    <div class="d-flex flex-wrap">
      <div class="pr-1">Title:</div>
      <div>${question.title}</div>
    </div>
  `;
}

function VariantInfo({ variant }: { variant?: Variant & { formatted_date: string } }) {
  if (variant == null) return '';

  const duration =
    // Some legacy questions still return the duration as a string, so parse it before formatting
    typeof variant.duration === 'string'
      ? IntervalSchema.parse(variant.duration)
      : variant.duration ?? 0;
  return html`
    <div class="d-flex flex-wrap">
      <div class="pr-1">Started at:</div>
      <div>${variant.formatted_date}</div>
    </div>
    <div class="d-flex flex-wrap">
      <div class="pr-1">Duration:</div>
      <div>${formatInterval(duration)}</div>
    </div>
    <div class="d-flex flex-wrap pb-2">
      <div class="pr-1">
        <button class="btn btn-link" data-toggle="collapse" data-target="#instructorTrue_answer">
          Show/Hide answer
        </button>
      </div>
      <div class="collapse" id="instructorTrue_answer">
        <code>${JSON.stringify(variant.true_answer)}</code>
      </div>
    </div>
  `;
}

function AssessmentInstanceInfo({
  assessment,
  assessment_instance,
}: {
  assessment?: Assessment;
  assessment_instance?: AssessmentInstance & { formatted_date: string };
}) {
  if (assessment == null || assessment_instance == null) return '';

  const instructorUrlPrefix = `${config.urlPrefix}/course_instance/${assessment.course_instance_id}/instructor`;
  const duration =
    // Some legacy questions still return the duration as a string, so parse it before formatting
    typeof assessment_instance.duration === 'string'
      ? IntervalSchema.parse(assessment_instance.duration)
      : assessment_instance.duration ?? 0;

  return html`
    <hr />
    <h5 class="card-title">Assessment Instance:</h5>
    <div class="d-flex flex-wrap">
      <div class="pr-1">AID:</div>
      <div>
        <a href="${instructorUrlPrefix}/assessment/${assessment.id}">${assessment.tid}</a>
      </div>
    </div>

    <div class="d-flex flex-wrap">
      <div class="pr-1">Started at:</div>
      <div>${assessment_instance.formatted_date}</div>
    </div>

    <div class="d-flex flex-wrap">
      <div class="pr-1">Duration:</div>
      <div>${formatInterval(duration)}</div>
    </div>

    <div class="pb-2">
      <a href="${instructorUrlPrefix}/assessment_instance/${assessment_instance.id}">View log</a>
    </div>
  `;
}

function ManualGradingInfo({
  instance_question,
  assessment,
  questionContext,
}: {
  instance_question?:
    | (InstanceQuestion & {
        assigned_grader_name?: string | null;
        last_grader_name?: string | null;
      })
    | null;
  assessment?: Assessment | null;
  questionContext: QuestionContext;
}) {
  if (instance_question == null || assessment == null) return '';

  const manualGradingUrl = `${config.urlPrefix}/course_instance/${assessment.course_instance_id}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instance_question.id}`;

  return html`
    <hr />
    <h5 class="card-title">Manual Grading:</h5>

    <div class="d-flex flex-wrap">
      <div class="pr-1">Status:</div>
      <div>${instance_question.requires_manual_grading ? 'Requires grading' : 'Graded'}</div>
    </div>

    ${instance_question.requires_manual_grading
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pr-1">Assigned to:</div>
            <div>${instance_question.assigned_grader_name ?? 'Unassigned'}</div>
          </div>
        `
      : ''}
    ${instance_question.last_grader
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pr-1">Graded by:</div>
            <div>${instance_question.last_grader_name}</div>
          </div>
        `
      : ''}
    ${questionContext !== 'manual_grading'
      ? html`
          <div class="pb-2">
            <a href="${manualGradingUrl}">Grade</a>
          </div>
        `
      : ''}
  `;
}

function IssueReportButton({
  variant,
  csrfToken,
  questionContext,
}: {
  variant?: (Variant & { formatted_date: string }) | null;
  csrfToken: string;
  questionContext: QuestionContext;
}) {
  if (
    variant == null ||
    questionContext === 'student_exam' ||
    questionContext === 'student_homework'
  ) {
    return '';
  }

  return html`
    <div class="row">
      <div class="col-auto">
        <button
          class="btn btn-sm btn-primary"
          type="button"
          data-toggle="collapse"
          data-target="#issueCollapse"
          aria-expanded="false"
          aria-controls="issueCollapse"
        >
          Report an issue with this question
        </button>
      </div>
    </div>
    <div class="collapse" id="issueCollapse">
      <hr />
      <form method="POST">
        <div class="form-group">
          <textarea
            class="form-control"
            rows="5"
            name="description"
            placeholder="Describe the issue"
          ></textarea>
        </div>
        <input type="hidden" name="__variant_id" value="${variant.id}" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <div class="form-group text-right">
          <button class="btn btn-small btn-warning" name="__action" value="report_issue">
            Report issue
          </button>
        </div>
      </form>
    </div>
  `;
}
