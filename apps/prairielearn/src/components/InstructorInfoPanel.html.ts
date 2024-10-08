import { formatDate, formatInterval } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { config } from '../lib/config.js';
import {
  DateFromISOString,
  IntervalSchema,
  type Assessment,
  type AssessmentInstance,
  type Course,
  type CourseInstance,
  type Group,
  type InstanceQuestion,
  type Question,
  type User,
  type Variant,
} from '../lib/db-types.js';

import type { QuestionContext } from './QuestionContainer.types.js';

export function InstructorInfoPanel({
  course,
  course_instance,
  assessment,
  assessment_instance,
  instance_question,
  question,
  variant,
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
  assessment_instance?: AssessmentInstance;
  instance_question?: InstanceQuestion & {
    assigned_grader_name?: string | null;
    last_grader_name?: string | null;
  };
  question?: Question;
  variant?: Variant;
  instance_group?: Group | null;
  instance_group_uid_list?: string[] | null;
  instance_user?: User | null;
  authz_data: Record<string, any>;
  question_is_shared?: boolean;
  questionContext: QuestionContext;
  csrfToken: string;
}) {
  // Here, we are only checking if the effective user is an instructor. We are
  // not attempting to check if this user has permission to view student data.
  // That check would have already been made (when necessary) before granting
  // access to the page on which this partial is included (an assessment
  // instance or question instance). We don't need this check when the question
  // is being previewed publicly because the public preview page already checks
  // for the necessary permissions.
  if (
    questionContext !== 'public' &&
    !authz_data.has_course_permission_preview &&
    !authz_data.has_course_instance_permission_view
  ) {
    return '';
  }

  const timeZone = course_instance?.display_timezone ?? course.display_timezone;

  return html`
    <div class="card mb-4 border-warning">
      <div class="card-header bg-warning">
        <h2>Staff information</h2>
      </div>
      <div class="card-body">
        ${InstanceUserInfo({ instance_user, instance_group, instance_group_uid_list })}
        ${QuestionInfo({
          course,
          course_instance,
          question,
          variant,
          question_is_shared,
          questionContext,
        })}
        ${VariantInfo({ variant, timeZone, questionContext })}
        ${IssueReportButton({ variant, csrfToken, questionContext })}
        ${AssessmentInstanceInfo({ assessment, assessment_instance, timeZone })}
        ${ManualGradingInfo({ instance_question, assessment, questionContext })}
      </div>
      <div class="card-footer small">This box is not visible to students.</div>
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
    <div>
      <details>
        ${instance_group != null
          ? html`
              <summary><h3 class="card-title h5">Group details</h3></summary>
              <div class="d-flex flex-wrap pb-2">
                <div class="pr-1">${instance_group.name}</div>
                <div class="pr-1">(${instance_group_uid_list?.join(', ')})</div>
              </div>
            `
          : html`
              <summary><h3 class="card-title d-inline-block h5">Student details</h3></summary>
              <div class="d-flex flex-wrap pb-2">
                <div class="pr-1">${instance_user?.name}</div>
                <div class="pr-1">${instance_user?.uid}</div>
              </div>
            `}
      </details>
    </div>
    <hr />
  `;
}

function QuestionInfo({
  course,
  course_instance,
  question,
  variant,
  question_is_shared,
  questionContext,
}: {
  course: Course;
  course_instance?: CourseInstance;
  question?: Question;
  variant?: Variant;
  question_is_shared?: boolean;
  questionContext: QuestionContext;
}) {
  if (question == null || variant == null) return '';

  const questionPreviewUrl = `${config.urlPrefix}/${
    course_instance != null
      ? `course_instance/${course_instance.id}/instructor`
      : `course/${course.id}`
  }/question/${question.id}?variant_seed=${variant.variant_seed}`;
  const publicPreviewUrl = `${config.urlPrefix}/public/course/${course.id}/question/${question.id}/preview`;

  // Example course questions can be publicly shared, but we don't allow them to
  // be imported into courses, so we won't show the sharing name in the QID.
  //
  // In the future, this should use some kind of "allow import" flag on the
  // question so that this behavior can be achieved within other courses.
  const sharingQid = course.example_course
    ? question.qid
    : `@${course.sharing_name}/${question.qid}`;

  return html`
    <h3 class="card-title h5">Question:</h3>

    <div class="d-flex flex-wrap">
      <div class="pr-1">QID:</div>
      <div>
        ${questionContext === 'public'
          ? html`<a href="${publicPreviewUrl}?variant_seed=${variant.variant_seed}">
              ${sharingQid}
            </a>`
          : html`<a href="${questionPreviewUrl}">${question.qid}</a>`}
      </div>
    </div>

    ${question_is_shared && course.sharing_name && questionContext !== 'public'
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pr-1">Shared As:</div>
            ${question.shared_publicly
              ? html`
                  <div>
                    <a href="${publicPreviewUrl}">${sharingQid}</a>
                  </div>
                `
              : html`<div>${sharingQid}</div>`}
          </div>
        `
      : ''}
    <div class="d-flex flex-wrap">
      <div class="pr-1">Title:</div>
      <div>${question.title}</div>
    </div>
  `;
}

function VariantInfo({
  variant,
  timeZone,
  questionContext,
}: {
  variant?: Variant;
  timeZone: string;
  questionContext: QuestionContext;
}) {
  if (variant == null) return '';

  // Some legacy queries still return the duration and date as a string, so parse them before formatting
  const duration =
    typeof variant.duration === 'string'
      ? IntervalSchema.parse(variant.duration)
      : (variant.duration ?? 0);
  const date =
    typeof variant.date === 'string' ? DateFromISOString.parse(variant.date) : variant.date;

  return html`
    ${questionContext !== 'public'
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pr-1">Started at:</div>
            <div>${date ? formatDate(date, timeZone) : '(unknown)'}</div>
          </div>
          <div class="d-flex flex-wrap">
            <div class="pr-1">Duration:</div>
            <div>${formatInterval(duration)}</div>
          </div>
        `
      : ''}
    <div class="d-flex flex-wrap mt-2 mb-3">
      <details class="pr-1">
        <summary>Show/Hide answer</summary>
        <pre><code>${JSON.stringify(variant.true_answer, null, 2)}</code></pre>
      </details>
    </div>
  `;
}

function AssessmentInstanceInfo({
  assessment,
  assessment_instance,
  timeZone,
}: {
  assessment?: Assessment;
  assessment_instance?: AssessmentInstance;
  timeZone: string;
}) {
  if (assessment == null || assessment_instance == null) return '';

  const instructorUrlPrefix = `${config.urlPrefix}/course_instance/${assessment.course_instance_id}/instructor`;

  // Some legacy queries still return the duration and date as a string, so parse them before formatting
  const duration =
    typeof assessment_instance.duration === 'string'
      ? IntervalSchema.parse(assessment_instance.duration)
      : (assessment_instance.duration ?? 0);
  const date =
    typeof assessment_instance.date === 'string'
      ? DateFromISOString.parse(assessment_instance.date)
      : assessment_instance.date;

  return html`
    <hr />
    <h3 class="card-title h5">Assessment Instance:</h3>
    <div class="d-flex flex-wrap">
      <div class="pr-1">AID:</div>
      <div>
        <a href="${instructorUrlPrefix}/assessment/${assessment.id}">${assessment.tid}</a>
      </div>
    </div>

    <div class="d-flex flex-wrap">
      <div class="pr-1">Started at:</div>
      <div>${date ? formatDate(date, timeZone) : '(unknown)'}</div>
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
  if (
    instance_question == null ||
    assessment == null ||
    instance_question.status === 'unanswered'
  ) {
    return '';
  }

  const manualGradingUrl = `${config.urlPrefix}/course_instance/${assessment.course_instance_id}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instance_question.id}`;

  return html`
    <hr />
    <h3 class="card-title h5">Manual Grading:</h3>

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
  variant?: Variant | null;
  csrfToken: string;
  questionContext: QuestionContext;
}) {
  if (
    variant == null ||
    questionContext === 'student_exam' ||
    questionContext === 'student_homework' ||
    questionContext === 'public'
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
            required
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
