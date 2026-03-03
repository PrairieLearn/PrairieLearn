import * as async from 'async';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { generateSignedToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { AssessmentScorePanel } from '../components/AssessmentScorePanel.js';
import { QuestionFooterContent } from '../components/QuestionContainer.js';
import {
  type QuestionContext,
  type QuestionRenderContext,
} from '../components/QuestionContainer.types.js';
import { QuestionNavSideButton } from '../components/QuestionNavigation.js';
import { QuestionScorePanelContent } from '../components/QuestionScore.js';
import {
  SubmissionBasicSchema,
  SubmissionDetailedSchema,
  type SubmissionForRender,
  SubmissionPanel,
} from '../components/SubmissionPanel.js';
import { computeNextAllowedGradingTimeMs } from '../models/instance-question.js';
import { selectAndAuthzVariant, selectVariantsByInstanceQuestion } from '../models/variant.js';
import * as questionServers from '../question-servers/index.js';

import type { ResLocalsAuthnUser } from './authn.types.js';
import { config } from './config.js';
import {
  type Assessment,
  type AssessmentInstance,
  AssessmentInstanceSchema,
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  type Course,
  type CourseInstance,
  CourseInstanceSchema,
  CourseSchema,
  type EnumQuestionAccessMode,
  EnumQuestionAccessModeSchema,
  GradingJobSchema,
  type GroupConfig,
  GroupConfigSchema,
  type InstanceQuestion,
  type Question,
  type Submission,
  SubmissionSchema,
  type User,
  type Variant,
} from './db-types.js';
import {
  type QuestionGroupPermissions,
  getGroupInfo,
  getQuestionGroupPermissions,
  getUserRoles,
} from './groups.js';
import { writeCourseIssues } from './issues.js';
import * as manualGrading from './manualGrading.js';
import { selectRubricData } from './manualGrading.js';
import {
  IssueRenderDataSchema,
  type QuestionUrls,
  type ResLocalsInstanceQuestionRenderAdded,
  type ResLocalsQuestionRenderAdded,
  type SubmissionPanels,
} from './question-render.types.js';
import { ensureVariant, getQuestionCourse } from './question-variant.js';
import type { UntypedResLocals } from './res-locals.types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SubmissionInfoSchema = z.object({
  grading_job: GradingJobSchema.nullable(),
  submission: SubmissionSchema,
  question_number: z.string().nullable(),
  question_access_mode: EnumQuestionAccessModeSchema.nullable(),
  next_instance_question: z.object({
    id: IdSchema.nullable(),
    question_access_mode: EnumQuestionAccessModeSchema.nullable(),
  }),
  assessment_question: AssessmentQuestionSchema.nullable(),
  assessment_instance: AssessmentInstanceSchema.nullable(),
  assessment: AssessmentSchema.nullable(),
  assessment_set: AssessmentSetSchema.nullable(),
  course_instance: CourseInstanceSchema.nullable(),
  variant_course: CourseSchema,
  question_course: CourseSchema,
  formatted_date: z.string(),
  user_uid: z.string().nullable(),
  submission_index: z.coerce.number(),
  submission_count: z.coerce.number(),
  group_config: GroupConfigSchema.nullable(),
});

/**
 * To improve performance, we'll only render at most three submissions on page
 * load. If the user requests more, we'll render them on the fly.
 */
const MAX_RECENT_SUBMISSIONS = 3;

/**
 * Renders the HTML for a variant.
 *
 * @param params
 * @param params.variant_course The course for the variant.
 * @param params.renderSelection Specify which panels should be rendered.
 * @param params.variant The variant to submit to.
 * @param params.question The question for the variant.
 * @param params.submission The current submission to the variant.
 * @param params.submissions The full list of submissions to the variant.
 * @param params.question_course The course for the question.
 * @param params.locals The current locals for the page response.
 */
async function render({
  variant_course,
  renderSelection,
  variant,
  question,
  submission,
  submissions,
  question_course,
  locals,
}: {
  variant_course: Course;
  renderSelection: questionServers.RenderSelection;
  variant: Variant;
  question: Question;
  submission: Submission | null;
  submissions: Submission[];
  question_course: Course;
  locals: UntypedResLocals;
}): Promise<questionServers.RenderResultData> {
  const questionModule = questionServers.getModule(question.type);

  const { courseIssues, data } = await questionModule.render({
    renderSelection,
    variant,
    question,
    submission,
    submissions,
    course: question_course,
    locals,
  });

  const studentMessage = 'Error rendering question';
  const courseData = { variant, question, submission, course: variant_course };
  // user information may not be populated when rendering a panel.
  const user_id = locals.user?.id ?? null;
  const authn_user_id = locals.authn_user?.id ?? null;
  await writeCourseIssues(
    courseIssues,
    variant,
    user_id,
    authn_user_id,
    studentMessage,
    courseData,
  );
  return data;
}

/**
 * Internal helper function to generate URLs that are used to render
 * question panels.
 *
 * @param urlPrefix The prefix of the generated URLs.
 * @param variant The variant object for this question.
 * @param question The question.
 * @param instance_question The instance question.
 * @returns An object containing the named URLs.
 */
export function buildQuestionUrls(
  urlPrefix: string,
  variant: Variant,
  question: Question,
  instance_question: InstanceQuestion | null,
  publicQuestionPreview = false,
): QuestionUrls {
  let urls: QuestionUrls;

  if (!instance_question) {
    // instructor question pages
    const questionUrl = urlPrefix + '/question/' + question.id + '/';

    urls = {
      questionUrl,
      newVariantUrl: questionUrl + 'preview/',
      tryAgainUrl: questionUrl + 'preview/',
      reloadUrl: questionUrl + 'preview/' + '?variant_id=' + variant.id,
      clientFilesQuestionUrl: questionUrl + 'clientFilesQuestion',

      // necessary for backward compatibility
      calculationQuestionFileUrl: questionUrl + 'file',

      calculationQuestionGeneratedFileUrl:
        questionUrl + 'generatedFilesQuestion/variant/' + variant.id,

      clientFilesCourseUrl: questionUrl + 'clientFilesCourse',
      clientFilesQuestionGeneratedFileUrl:
        questionUrl + 'generatedFilesQuestion/variant/' + variant.id,
      baseUrl: urlPrefix,
      externalImageCaptureUrl: config.serverCanonicalHost
        ? config.serverCanonicalHost + questionUrl + 'externalImageCapture/variant/' + variant.id
        : null,
    };
  } else {
    // student question pages
    const iqUrl = urlPrefix + '/instance_question/' + instance_question.id + '/';

    urls = {
      questionUrl: iqUrl,
      newVariantUrl: iqUrl,
      tryAgainUrl: iqUrl,
      reloadUrl: iqUrl + '?variant_id=' + variant.id,
      clientFilesQuestionUrl: iqUrl + 'clientFilesQuestion',

      // necessary for backward compatibility
      calculationQuestionFileUrl: iqUrl + 'file',

      calculationQuestionGeneratedFileUrl: iqUrl + 'generatedFilesQuestion/variant/' + variant.id,

      clientFilesCourseUrl: iqUrl + 'clientFilesCourse',
      clientFilesQuestionGeneratedFileUrl: iqUrl + 'generatedFilesQuestion/variant/' + variant.id,
      baseUrl: urlPrefix,
      externalImageCaptureUrl: config.serverCanonicalHost
        ? config.serverCanonicalHost + iqUrl + 'externalImageCapture/variant/' + variant.id
        : null,
    };
  }

  if (variant.workspace_id) {
    if (publicQuestionPreview) {
      urls.workspaceUrl = `/pl/public/workspace/${variant.workspace_id}`;
    } else {
      urls.workspaceUrl = `/pl/workspace/${variant.workspace_id}`;
    }
  }

  return urls;
}

interface ResLocalsBuildLocals {
  showGradeButton: boolean;
  showSaveButton: boolean;
  disableGradeButton: boolean;
  disableSaveButton: boolean;
  showNewVariantButton: boolean;
  showTryAgainButton: boolean;
  showTrueAnswer: boolean;
  showGradingRequested: boolean;
  allowAnswerEditing: boolean;
  hasAttemptsOtherVariants: boolean;
  variantAttemptsLeft: number;
  variantAttemptsTotal: number;
  submissions: SubmissionForRender[];
  variantToken: string;
  jobSequenceTokens: Record<string, string>;
}

function buildLocals({
  variant,
  question,
  instance_question,
  group_role_permissions,
  assessment,
  assessment_instance,
  assessment_question,
  group_config,
  allowGradeLeftMs,
  authz_result,
  question_access_mode,
}: {
  variant: Variant;
  question: Question;
  instance_question?: InstanceQuestion | null;
  group_role_permissions?: {
    can_view: boolean;
    can_submit: boolean;
  } | null;
  assessment?: Assessment | null;
  assessment_instance?: AssessmentInstance | null;
  assessment_question?: AssessmentQuestion | null;
  group_config?: GroupConfig | null;
  allowGradeLeftMs: number;
  authz_result?: any;
  question_access_mode?: EnumQuestionAccessMode | null;
}) {
  const locals: ResLocalsBuildLocals = {
    showGradeButton: false,
    showSaveButton: false,
    disableGradeButton: false,
    disableSaveButton: false,
    showNewVariantButton: false,
    showTryAgainButton: false,
    showTrueAnswer: false,
    showGradingRequested: false,
    allowAnswerEditing: false,
    hasAttemptsOtherVariants: false,
    variantAttemptsLeft: 0,
    variantAttemptsTotal: 0,
    submissions: [],

    // Used for "auth" for external grading realtime results
    // ID is coerced to a string so that it matches what we get back from the client
    variantToken: generateSignedToken({ variantId: variant.id.toString() }, config.secretKey),
    jobSequenceTokens: {},
  };

  if (!assessment || !assessment_instance || !assessment_question || !instance_question) {
    // instructor question pages
    locals.showGradeButton = true;
    locals.showSaveButton = true;
    locals.allowAnswerEditing = true;
    locals.showNewVariantButton = true;
  } else {
    // student question pages
    if (assessment.type === 'Homework') {
      locals.showGradeButton = true;
      locals.showSaveButton = true;
      locals.allowAnswerEditing = true;
      if (!question.single_variant) {
        locals.hasAttemptsOtherVariants = true;
        // TODO: can get rid of the nullish coalescing if we mark `tries_per_variant` as `NOT NULL`.
        locals.variantAttemptsLeft =
          (assessment_question.tries_per_variant ?? 1) - variant.num_tries;
        locals.variantAttemptsTotal = assessment_question.tries_per_variant ?? 1;
      }
      // TODO: can get rid of the nullish coalescing if we mark `score_perc` as `NOT NULL`.
      if (question.single_variant && (instance_question.score_perc ?? 0) >= 100) {
        locals.showTrueAnswer = true;
      }
    }
    if (assessment.type === 'Exam') {
      if (assessment_instance.open && instance_question.open) {
        locals.showGradeButton = true;
        locals.showSaveButton = true;
        locals.allowAnswerEditing = true;
        locals.variantAttemptsLeft = (instance_question.points_list ?? []).length;
        locals.variantAttemptsTotal = (instance_question.points_list_original ?? []).length;
      } else {
        locals.showTrueAnswer = true;
      }
    }
    if (assessment_question.allow_real_time_grading === false) {
      locals.showGradeButton = false;
    }
    if (allowGradeLeftMs > 0) {
      locals.disableGradeButton = true;
    }
  }

  if (question_access_mode === 'read_only_lockpoint') {
    locals.showGradeButton = false;
    locals.showSaveButton = false;
    locals.allowAnswerEditing = false;
  }

  if (
    !variant.open ||
    (instance_question && !instance_question.open) ||
    (assessment_instance && !assessment_instance.open)
  ) {
    locals.showGradeButton = false;
    locals.showSaveButton = false;
    locals.allowAnswerEditing = false;
    if (assessment?.type === 'Homework') {
      locals.showTryAgainButton = true;
      locals.showTrueAnswer = true;
    }
  }

  if (variant.broken_at) {
    locals.showGradeButton = false;
    locals.showSaveButton = false;
    locals.showTryAgainButton = true;
  }

  // The method to determine if this is a manual-only question depends on the context.
  // If the question is being rendered in an assessment, we check if there are manual points and no auto points.
  // If the question is being rendered in question preview, we use the grading method as a proxy.
  if (
    assessment_question
      ? !assessment_question.max_auto_points && assessment_question.max_manual_points
      : question.grading_method === 'Manual'
  ) {
    locals.showGradeButton = false;
  }

  if (authz_result && !authz_result.active) {
    locals.showGradeButton = false;
    locals.showSaveButton = false;
    locals.showNewVariantButton = false;
    locals.allowAnswerEditing = false;
    locals.showTryAgainButton = false;
    locals.hasAttemptsOtherVariants = false;
    locals.showTrueAnswer = true;
  }

  // Manually disable correct answer panel
  if (!question.show_correct_answer) {
    locals.showTrueAnswer = false;
  }

  if (group_config?.has_roles && !group_role_permissions?.can_submit) {
    locals.disableGradeButton = true;
    locals.disableSaveButton = true;
  }

  return locals;
}

/**
 * Render all information needed for a question.
 *
 * @param variant_id The variant to render, or null if it should be generated.
 * @param variant_seed Random seed for variant, or null if it should be generated.
 * @param locals The current locals structure to read/write.
 */
export async function getAndRenderVariant(
  variant_id: string | null,
  variant_seed: string | null,
  locals: {
    urlPrefix: string;
    authn_user: ResLocalsAuthnUser['authn_user'];
    is_administrator: boolean;
    course: Course;
    question: Question;
    user: User;
    course_instance?: CourseInstance;
    course_instance_id?: string;
    assessment?: Assessment;
    assessment_instance?: AssessmentInstance;
    assessment_question?: AssessmentQuestion;
    group_config?: GroupConfig;
    group_role_permissions?: QuestionGroupPermissions;
    instance_question?: InstanceQuestion;
    instance_question_info?: { question_access_mode?: EnumQuestionAccessMode | null };
    authz_data?: Record<string, any>;
    authz_result?: Record<string, any>;
    client_fingerprint_id?: string | null;
    questionRenderContext?: QuestionRenderContext;
  } & Partial<ResLocalsInstanceQuestionRenderAdded> &
    Partial<ResLocalsQuestionRenderAdded>,
  {
    urlOverrides = {},
    publicQuestionPreview = false,
    issuesLoadExtraData = config.devMode || locals.authz_data?.has_course_permission_view,
  }: {
    urlOverrides?: Partial<QuestionUrls>;
    publicQuestionPreview?: boolean;
    /**
     * Whether or not any recorded issues should have their extra data loaded.
     * If not specified, the default is to load extra data if we're in dev mode
     * or if the user has permission to view course data.
     *
     * This toggle is useful mainly for AI question generation, where we always
     * want to load issue data so we can provided it as context to the model.
     *
     * The default conditions should match those in `components/QuestionContainer.html.ts`.
     */
    issuesLoadExtraData?: boolean;
  } = {},
) {
  const question_course = await getQuestionCourse(locals.question, locals.course);
  locals.question_is_shared = await sqldb.queryRow(
    sql.select_is_shared,
    { question_id: locals.question.id },
    z.boolean(),
  );

  const variant = await run(async () => {
    if (variant_id != null) {
      return await selectAndAuthzVariant({
        unsafe_variant_id: variant_id,
        variant_course: locals.course,
        question_id: locals.question.id,
        course_instance_id: locals.course_instance?.id,
        instance_question_id: locals.instance_question?.id,
        authz_data: locals.authz_data,
        authn_user: locals.authn_user,
        user: locals.user,
        is_administrator: locals.is_administrator,
        publicQuestionPreview,
      });
    } else {
      const require_open = !!locals.assessment && locals.assessment.type !== 'Exam';
      const instance_question_id = locals.instance_question?.id ?? null;
      const options = { variant_seed };
      return await ensureVariant({
        question_id: locals.question.id,
        instance_question_id,
        user_id: locals.user.id,
        authn_user_id: locals.authn_user.id,
        course_instance: locals.course_instance ?? null,
        variant_course: locals.course,
        question_course,
        options,
        require_open,
        client_fingerprint_id: locals.client_fingerprint_id ?? null,
      });
    }
  });

  locals.variant = variant;

  const {
    urlPrefix,
    course,
    course_instance,
    question,
    instance_question,
    assessment,
    assessment_instance,
    assessment_question,
    group_config,
    group_role_permissions,
    authz_result,
  } = locals;

  const urls = buildQuestionUrls(
    urlPrefix,
    variant,
    question,
    instance_question ?? null,
    publicQuestionPreview,
  );
  Object.assign(urls, urlOverrides);
  Object.assign(locals, urls);

  const allowGradeLeftMs =
    instance_question != null && assessment_question?.grade_rate_minutes
      ? await computeNextAllowedGradingTimeMs({ instanceQuestionId: instance_question.id })
      : 0;
  locals.allowGradeLeftMs = allowGradeLeftMs;

  const newLocals = buildLocals({
    variant,
    question,
    instance_question,
    group_role_permissions,
    assessment,
    assessment_instance,
    assessment_question,
    allowGradeLeftMs,
    group_config,
    authz_result,
    question_access_mode: locals.instance_question_info?.question_access_mode,
  });
  if (
    (locals.questionRenderContext === 'manual_grading' ||
      locals.questionRenderContext === 'ai_grading') &&
    question.show_correct_answer
  ) {
    newLocals.showTrueAnswer = true;
  }
  Object.assign(locals, newLocals);

  // We only fully render a small number of submissions on initial page
  // load; the rest only require basic information like timestamps. As
  // such, we'll load submissions in two passes: we'll load basic
  // information for all submissions to this variant, and then we'll
  // load the full submission for only the submissions that we'll
  // actually render.
  const basicSubmissions = await sqldb.queryRows(
    sql.select_basic_submissions,
    { variant_id: variant.id },
    SubmissionBasicSchema,
  );
  const submissionCount = basicSubmissions.length;

  const submissions = await run(async () => {
    if (submissionCount === 0) {
      return [];
    }

    // Load detailed information for the submissions that we'll render.
    // Note that for non-Freeform questions, we unfortunately have to
    // eagerly load detailed data for all submissions, as that ends up
    // being serialized in the HTML. v2 questions don't have any easy
    // way to support async rendering of submissions.
    const needsAllSubmissions = locals.question.type !== 'Freeform';
    const submissionsToRender = needsAllSubmissions
      ? basicSubmissions
      : basicSubmissions.slice(0, MAX_RECENT_SUBMISSIONS);
    const submissionDetails = await sqldb.queryRows(
      sql.select_detailed_submissions,
      { submission_ids: submissionsToRender.map((s) => s.id) },
      SubmissionDetailedSchema,
    );

    return basicSubmissions.map((s, idx) => ({
      submission_number: submissionCount - idx,
      ...s,
      // Both queries order results consistently, so we can just use
      // the array index to match up the basic and detailed results.
      ...(idx < submissionDetails.length ? submissionDetails[idx] : {}),
    })) satisfies SubmissionForRender[];
  });

  const submission = submissions.at(0) ?? null;
  locals.submissions = submissions;
  locals.submission = submission;

  if (!locals.assessment && locals.question.show_correct_answer && submissionCount > 0) {
    // On instructor question pages, only show if true answer is allowed for this question and there is at least one submission.
    locals.showTrueAnswer = true;
  }
  // We don't want to unconditionally hide things in the "else" case here,
  // there's other code elsewhere that could have set showTrueAnswer to true, and we should respect that.

  const renderSelection: questionServers.RenderSelection = {
    question: true,
    submissions: submissions.length > 0,
    answer: locals.showTrueAnswer ?? false,
  };
  const htmls = await render({
    variant_course: course,
    renderSelection,
    variant,
    question,
    submission: submission as Submission,
    submissions: submissions.slice(0, MAX_RECENT_SUBMISSIONS) as Submission[],
    question_course,
    locals,
  });
  locals.extraHeadersHtml = htmls.extraHeadersHtml;
  locals.questionHtml = htmls.questionHtml;
  locals.submissionHtmls = htmls.submissionHtmls;
  locals.answerHtml = htmls.answerHtml;

  // Load issues last in case rendering produced any new ones.
  locals.issues = await sqldb.queryRows(
    sql.select_issues,
    {
      variant_id: variant.id,
      load_course_data: issuesLoadExtraData,
      load_system_data: issuesLoadExtraData,
    },
    IssueRenderDataSchema,
  );

  if (locals.instance_question) {
    locals.rubric_data = await selectRubricData({
      assessment_question: locals.assessment_question,
      submission: locals.submission,
    });
    await async.eachSeries(submissions, manualGrading.populateManualGradingData);
  }

  if (locals.question.type !== 'Freeform') {
    const questionJson = JSON.stringify({
      questionFilePath: urls.calculationQuestionFileUrl,
      questionGeneratedFilePath: urls.calculationQuestionGeneratedFileUrl,
      effectiveQuestionType: 'Calculation',
      course,
      courseInstance: course_instance,
      variant: {
        id: variant.id,
        params: variant.params,
      },
      submittedAnswer: submission?.submitted_answer ?? null,
      feedback: submission?.feedback ?? null,
      trueAnswer: locals.showTrueAnswer ? variant.true_answer : null,
      submissions: submissions.length > 0 ? submissions : null,
    });

    const encodedJson = encodeURIComponent(questionJson);
    locals.questionJsonBase64 = Buffer.from(encodedJson).toString('base64');
  }
}

/**
 * Renders the panels that change when a grading job is completed; used to send real-time results
 * back to the client. This includes the submission panel by default, and if renderScorePanels is
 * set, also the side panels for score, navigation and the question footer.
 */
export async function renderPanelsForSubmission({
  unsafe_submission_id,
  question,
  instance_question,
  variant,
  user,
  urlPrefix,
  questionContext,
  questionRenderContext,
  authorizedEdit,
  renderScorePanels,
  groupRolePermissions,
  authz_result,
}: {
  unsafe_submission_id: string;
  question: Question;
  instance_question: InstanceQuestion | null;
  variant: Variant;
  user: User;
  urlPrefix: string;
  questionContext: QuestionContext;
  questionRenderContext?: QuestionRenderContext;
  authorizedEdit: boolean;
  renderScorePanels: boolean;
  groupRolePermissions: { can_view: boolean; can_submit: boolean } | null;
  authz_result?: { active: boolean };
}): Promise<SubmissionPanels> {
  const submissionInfo = await sqldb.queryOptionalRow(
    sql.select_submission_info,
    {
      unsafe_submission_id,
      question_id: question.id,
      instance_question_id: instance_question?.id,
      variant_id: variant.id,
    },
    SubmissionInfoSchema,
  );
  if (submissionInfo == null) throw new error.HttpStatusError(404, 'Not found');

  const {
    submission,
    next_instance_question,
    assessment_question,
    assessment_instance,
    assessment,
    assessment_set,
    variant_course,
    question_course,
    course_instance,
    submission_index,
    submission_count,
    grading_job,
    formatted_date,
    user_uid,
    question_number,
    group_config,
    question_access_mode,
  } = submissionInfo;
  const previous_variants =
    variant.instance_question_id == null || assessment_instance == null
      ? null
      : await selectVariantsByInstanceQuestion({
          assessment_instance_id: assessment_instance.id,
          instance_question_id: variant.instance_question_id,
        });
  const allowGradeLeftMs =
    instance_question != null && assessment_question?.grade_rate_minutes
      ? await computeNextAllowedGradingTimeMs({ instanceQuestionId: instance_question.id })
      : 0;

  const panels: SubmissionPanels = {
    submissionPanel: null,
    extraHeadersHtml: null,
  };

  const locals = {
    urlPrefix,
    questionRenderContext,
    ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
    ...buildLocals({
      variant,
      question,
      instance_question,
      group_role_permissions: groupRolePermissions,
      assessment,
      assessment_instance,
      assessment_question,
      allowGradeLeftMs,
      group_config,
      authz_result,
      question_access_mode,
    }),
  };

  await async.parallel([
    async () => {
      // Render the submission panel
      const submissions = [submission];

      const htmls = await render({
        variant_course,
        renderSelection: {
          answer: renderScorePanels && locals.showTrueAnswer,
          submissions: true,
          question: false,
        },
        variant,
        question,
        submission,
        submissions,
        question_course,
        locals,
      });

      panels.answerPanel = locals.showTrueAnswer ? htmls.answerHtml : null;
      panels.extraHeadersHtml = htmls.extraHeadersHtml;

      const rubric_data = await manualGrading.selectRubricData({
        assessment_question,
        submission,
      });
      await manualGrading.populateManualGradingData(submission);

      panels.submissionPanel = SubmissionPanel({
        questionContext,
        questionRenderContext,
        question,
        variant_id: variant.id,
        assessment_question,
        instance_question,
        course_instance_id: course_instance?.id,
        submission: {
          ...submission,
          grading_job,
          formatted_date,
          user_uid,
          submission_number: submission_index,
        },
        submissionHtml: htmls.submissionHtmls[0],
        submissionCount: submission_count,
        rubric_data,
        expanded: true,
        urlPrefix,
      }).toString();
    },
    async () => {
      // Render the question score panel
      if (!renderScorePanels) return;

      // The score panel can and should only be rendered for
      // questions that are part of an assessment
      if (
        instance_question == null ||
        assessment_question == null ||
        assessment_instance == null ||
        assessment == null
      ) {
        return;
      }

      panels.questionScorePanel = QuestionScorePanelContent({
        instance_question,
        assessment_question,
        assessment_instance,
        assessment,
        question,
        variant,
        urlPrefix,
        instance_question_info: { question_number, previous_variants },
        allowGradeLeftMs,
      }).toString();
    },
    async () => {
      // Render the assessment score panel
      if (!renderScorePanels) return;

      // As usual, only render if this variant is part of an assessment
      if (assessment == null || assessment_set == null || assessment_instance == null) return;

      panels.assessmentScorePanel = AssessmentScorePanel({
        urlPrefix,
        assessment,
        assessment_set,
        assessment_instance,
      }).toString();
    },
    async () => {
      // Render the question panel footer
      if (!renderScorePanels) return;

      const group_info = await run(async () => {
        if (!assessment_instance?.team_id || !group_config) return null;

        return await getGroupInfo(assessment_instance.team_id, group_config);
      });

      panels.questionPanelFooter = QuestionFooterContent({
        resLocals: {
          variant,
          question,
          assessment_question,
          instance_question,
          authz_result: { authorized_edit: authorizedEdit },
          instance_question_info: { previous_variants },
          group_config,
          group_info,
          group_role_permissions: groupRolePermissions,
          user,
          allowGradeLeftMs,
          ...locals,
        },
        questionContext,
      }).toString();
    },
    async () => {
      if (!renderScorePanels) return;

      // If there is no assessment, the next question button won't exist, so it
      // does not need to be rendered. If there is no next question, the button
      // is disabled, so it does not need to be replaced.
      if (variant.instance_question_id == null || next_instance_question.id == null) return;

      let nextQuestionGroupRolePermissions: { can_view: boolean } | null = null;
      let userGroupRoles = 'None';

      if (assessment_instance?.team_id && group_config?.has_roles) {
        nextQuestionGroupRolePermissions = await getQuestionGroupPermissions(
          next_instance_question.id,
          assessment_instance.team_id,
          user.id,
        );
        userGroupRoles =
          (await getUserRoles(assessment_instance.team_id, user.id))
            .map((role) => role.role_name)
            .join(', ') || 'None';
      }

      panels.questionNavNextButton = QuestionNavSideButton({
        instanceQuestionId: next_instance_question.id,
        nextQuestionAccessMode: next_instance_question.question_access_mode,
        urlPrefix,
        whichButton: 'next',
        groupRolePermissions: nextQuestionGroupRolePermissions,
        advanceScorePerc: assessment_question?.advance_score_perc,
        userGroupRoles,
      }).toString();
    },
  ]);
  return panels;
}
