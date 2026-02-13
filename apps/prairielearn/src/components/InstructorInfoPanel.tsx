import { formatDate, formatInterval } from '@prairielearn/formatter';
import { type HtmlValue, html } from '@prairielearn/html';
import { DateFromISOString, IntervalSchema } from '@prairielearn/zod';

import {
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
  assignedGrader,
  lastGrader,
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
  instance_question?: InstanceQuestion;
  assignedGrader?: User | null;
  lastGrader?: User | null;
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
    <div class="card mb-3 border-warning">
      <div class="card-header bg-warning">
        <h2>Staff information</h2>
      </div>
      ${ListGroup([
        InstanceUserInfo({ instance_user, instance_group, instance_group_uid_list }),
        QuestionInfo({
          course,
          course_instance,
          question,
          variant,
          question_is_shared,
          questionContext,
        }),
        VariantInfo({ variant, timeZone, questionContext }),
        IssueReportButton({ variant, csrfToken, questionContext }),
        AssessmentInstanceInfo({ assessment, assessment_instance, timeZone }),
        ManualGradingInfo({
          instance_question,
          assignedGrader,
          lastGrader,
          assessment,
          questionContext,
        }),
      ])}
      <div class="card-footer small">This box is not visible to students.</div>
    </div>
  `;
}

function ListGroup(children: HtmlValue[]) {
  const filteredChildren = children.filter((child) => !!child);

  return html`
    <div class="list-group list-group-flush">
      ${filteredChildren.map((child) => html`<div class="list-group-item py-3">${child}</div>`)}
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
              <div class="d-flex flex-wrap">
                <div class="pe-1">${instance_group.name}</div>
                <div class="pe-1">(${instance_group_uid_list?.join(', ')})</div>
              </div>
            `
          : html`
              <summary><h3 class="card-title d-inline-block h5 mb-0">Student details</h3></summary>
              <div class="d-flex flex-wrap mt-2">
                <div class="pe-1">${instance_user?.name}</div>
                <div class="pe-1">${instance_user?.uid}</div>
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

  const questionPreviewUrl = `/pl/${
    course_instance != null
      ? `course_instance/${course_instance.id}/instructor`
      : `course/${course.id}`
  }/question/${question.id}?variant_seed=${variant.variant_seed}`;
  const publicPreviewUrl = `/pl/public/course/${question.course_id}/question/${question.id}/preview`;

  // We don't show the sharing name in the QID if the question is not shared
  // publicly for importing, such as if only `share_source_publicly` is set.
  //
  // TODO: Remove the special-casing of the example course once its questions
  // have been updated to use `share_source_publicly`. This special-casing
  // predates the ability to share questions only for copying, not importing.
  const sharingQid =
    course.example_course || !question.share_publicly
      ? question.qid
      : `@${course.sharing_name}/${question.qid}`;

  return html`
    <h3 class="card-title h5">Question</h3>

    <div class="d-flex flex-wrap">
      <div class="pe-1">QID:</div>
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
            <div class="pe-1">Shared As:</div>
            ${question.share_publicly || question.share_source_publicly
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
      <div class="pe-1">Title:</div>
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
    <h3 class="card-title h5">Variant</h3>
    ${questionContext !== 'public'
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pe-1">Started at:</div>
            <div>${date ? formatDate(date, timeZone) : '(unknown)'}</div>
          </div>
          <div class="d-flex flex-wrap">
            <div class="pe-1">Duration:</div>
            <div>${formatInterval(duration)}</div>
          </div>
        `
      : ''}
    <div class="d-flex flex-wrap">
      <details class="pe-1">
        <summary>Show/Hide answer</summary>
        <pre class="mt-2 mb-0"><code>${JSON.stringify(variant.true_answer, null, 2)}</code></pre>
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

  const instructorUrlPrefix = `/pl/course_instance/${assessment.course_instance_id}/instructor`;

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
    <h3 class="card-title h5">Assessment instance</h3>
    <div class="d-flex flex-wrap">
      <div class="pe-1">Assessment:</div>
      <div>
        <a href="${instructorUrlPrefix}/assessment/${assessment.id}">${assessment.tid}</a>
      </div>
    </div>

    <div class="d-flex flex-wrap">
      <div class="pe-1">Started at:</div>
      <div>${date ? formatDate(date, timeZone) : '(unknown)'}</div>
    </div>

    <div class="d-flex flex-wrap">
      <div class="pe-1">Duration:</div>
      <div>${formatInterval(duration)}</div>
    </div>

    <div class="pb-2">
      <a href="${instructorUrlPrefix}/assessment_instance/${assessment_instance.id}">View log</a>
    </div>
  `;
}

function ManualGradingInfo({
  instance_question,
  assignedGrader,
  lastGrader,
  assessment,
  questionContext,
}: {
  instance_question?: InstanceQuestion | null;
  assignedGrader?: User | null;
  lastGrader?: User | null;
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

  const manualGradingUrl = `/pl/course_instance/${assessment.course_instance_id}/instructor/assessment/${assessment.id}/manual_grading/instance_question/${instance_question.id}`;

  return html`
    <h3 class="card-title h5">Manual grading</h3>

    <div class="d-flex flex-wrap">
      <div class="pe-1">Status:</div>
      <div>${instance_question.requires_manual_grading ? 'Requires grading' : 'Graded'}</div>
    </div>

    ${instance_question.requires_manual_grading
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pe-1">Assigned to:</div>
            <div>
              ${assignedGrader?.name
                ? `${assignedGrader.name} (${assignedGrader.uid})`
                : (assignedGrader?.uid ?? 'Unassigned')}
            </div>
          </div>
        `
      : ''}
    ${lastGrader
      ? html`
          <div class="d-flex flex-wrap">
            <div class="pe-1">Graded by:</div>
            <div>
              ${lastGrader.name ? `${lastGrader.name} (${lastGrader.uid})` : lastGrader.uid}
            </div>
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
    <button
      class="btn btn-sm btn-primary"
      type="button"
      data-bs-toggle="collapse"
      data-bs-target="#issueCollapse"
      aria-expanded="false"
      aria-controls="issueCollapse"
    >
      Report an issue with this question
    </button>
    <div class="collapse" id="issueCollapse">
      <form method="POST" class="mt-3">
        <div class="mb-3">
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
        <button type="submit" class="btn btn-sm btn-warning" name="__action" value="report_issue">
          Report issue
        </button>
      </form>
    </div>
  `;
}
