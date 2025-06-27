import * as async from 'async';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { generateSignedToken } from '@prairielearn/signed-token';

import { AssessmentScorePanel } from '../components/AssessmentScorePanel.html.js';
import { QuestionFooterContent } from '../components/QuestionContainer.html.js';
import {
  type QuestionContext,
  type QuestionRenderContext,
} from '../components/QuestionContainer.types.js';
import { QuestionNavSideButton } from '../components/QuestionNavigation.html.js';
import { QuestionScorePanelContent } from '../components/QuestionScore.html.js';
import {
  SubmissionBasicSchema,
  SubmissionDetailedSchema,
  type SubmissionForRender,
  SubmissionPanel,
} from '../components/SubmissionPanel.html.js';
import { selectAndAuthzVariant, selectVariantsByInstanceQuestion } from '../models/variant.js';
import * as questionServers from '../question-servers/index.js';

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
  GradingJobSchema,
  type GroupConfig,
  GroupConfigSchema,
  IdSchema,
  type InstanceQuestion,
  IssueSchema,
  type Question,
  type Submission,
  SubmissionSchema,
  type User,
  type Variant,
} from './db-types.js';
import { getGroupInfo, getQuestionGroupPermissions, getUserRoles } from './groups.js';
import { writeCourseIssues } from './issues.js';
import * as manualGrading from './manualGrading.js';
import type { SubmissionPanels } from './question-render.types.js';
import { ensureVariant, getQuestionCourse } from './question-variant.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const IssueRenderDataSchema = IssueSchema.extend({
  formatted_date: z.string().nullable(),
  user_uid: z.string().nullable(),
  user_name: z.string().nullable(),
  user_email: z.string().nullable(),
});

type InstanceQuestionWithAllowGrade = InstanceQuestion & {
  allow_grade_left_ms: number;
  allow_grade_date: Date | null;
  allow_grade_interval: string;
};

const SubmissionInfoSchema = z.object({
  grading_job: GradingJobSchema.nullable(),
  submission: SubmissionSchema,
  question_number: z.string().nullable(),
  next_instance_question: z.object({
    id: IdSchema.nullable(),
    sequence_locked: z.boolean().nullable(),
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
 * @param variant_course The course for the variant.
 * @param renderSelection Specify which panels should be rendered.
 * @param variant The variant to submit to.
 * @param question The question for the variant.
 * @param submission The current submission to the variant.
 * @param submissions The full list of submissions to the variant.
 * @param question_course The course for the question.
 * @param locals The current locals for the page response.
 */
async function render(
  variant_course: Course,
  renderSelection: questionServers.RenderSelection,
  variant: Variant,
  question: Question,
  submission: Submission | null,
  submissions: Submission[],
  question_course: Course,
  locals: Record<string, any>,
): Promise<questionServers.RenderResultData> {
  const questionModule = questionServers.getModule(question.type);

  const { courseIssues, data } = await questionModule.render(
    renderSelection,
    variant,
    question,
    submission,
    submissions,
    question_course,
    locals,
  );

  const studentMessage = 'Error rendering question';
  const courseData = { variant, question, submission, course: variant_course };
  // user information may not be populated when rendering a panel.
  const user_id = locals.user && locals.user.user_id ? locals.user.user_id : null;
  const authn_user_id = locals && locals.authn_user ? locals.authn_user.user_id : null;
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

interface QuestionUrls {
  questionUrl: string;
  newVariantUrl: string;
  tryAgainUrl: string;
  reloadUrl: string;
  clientFilesQuestionUrl: string;
  calculationQuestionFileUrl: string;
  calculationQuestionGeneratedFileUrl: string;
  clientFilesCourseUrl: string;
  clientFilesQuestionGeneratedFileUrl: string;
  baseUrl: string;
  externalImageCaptureUrl: string | null;
  workspaceUrl?: string;
}

/**
 * Internal helper function to generate URLs that are used to render
 * question panels.
 *
 * @param urlPrefix The prefix of the generated URLs.
 * @param variant The variant object for this question.
 * @param question The question.
 * @param instance_question The instance question.
 * @return An object containing the named URLs.
 */
export function buildQuestionUrls(
  urlPrefix: string,
  variant: Variant,
  question: Question,
  instance_question: InstanceQuestion | null,
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
    urls.workspaceUrl = `/pl/workspace/${variant.workspace_id}`;
  }

  return urls;
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
  authz_result,
}: {
  variant: Variant;
  question: Question;
  instance_question?: InstanceQuestionWithAllowGrade | null;
  group_role_permissions?: {
    can_view: boolean;
    can_submit: boolean;
  } | null;
  assessment?: Assessment | null;
  assessment_instance?: AssessmentInstance | null;
  assessment_question?: AssessmentQuestion | null;
  group_config?: GroupConfig | null;
  authz_result?: any;
}) {
  const locals = {
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
      if (question.single_variant && (instance_question.score_perc ?? 0) >= 100.0) {
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
    if (!assessment.allow_real_time_grading) {
      locals.showGradeButton = false;
    }
    if (instance_question.allow_grade_left_ms > 0) {
      locals.disableGradeButton = true;
    }
  }

  if (
    !variant.open ||
    (instance_question && !instance_question.open) ||
    (assessment_instance && !assessment_instance.open)
  ) {
    locals.showGradeButton = false;
    locals.showSaveButton = false;
    locals.allowAnswerEditing = false;
    if (assessment && assessment.type === 'Homework') {
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
      : question?.grading_method === 'Manual'
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
  if (!question?.show_correct_answer) {
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
    course: Course;
    question: Question;
    user: User;
    authn_user: User;
    course_instance?: CourseInstance;
    course_instance_id?: string;
    assessment?: Assessment;
    assessment_instance?: AssessmentInstance;
    assessment_question?: AssessmentQuestion;
    group_config?: GroupConfig;
    group_role_permissions?: { can_view: boolean; can_submit: boolean };
    instance_question?: InstanceQuestionWithAllowGrade;
    authz_data?: Record<string, any>;
    authz_result?: Record<string, any>;
    client_fingerprint_id?: string | null;
    is_administrator: boolean;
    questionRenderContext?: QuestionRenderContext;
  },
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
  // We write a fair amount of unstructured data back into locals,
  // so we'll cast it to `any` once so we don't have to do it every time.
  const resultLocals = locals as any;

  const question_course = await getQuestionCourse(locals.question, locals.course);
  resultLocals.question_is_shared = await sqldb.queryRow(
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
      const course_instance_id = locals.course_instance_id ?? locals.course_instance?.id ?? null;
      const options = { variant_seed };
      return await ensureVariant(
        locals.question.id,
        instance_question_id,
        locals.user.user_id,
        locals.authn_user.user_id,
        course_instance_id,
        locals.course,
        question_course,
        options,
        require_open,
        locals.client_fingerprint_id ?? null,
      );
    }
  });

  resultLocals.variant = variant;

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

  const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question ?? null);
  Object.assign(urls, urlOverrides);
  Object.assign(locals, urls);

  const newLocals = buildLocals({
    variant,
    question,
    instance_question,
    group_role_permissions,
    assessment,
    assessment_instance,
    assessment_question,
    group_config,
    authz_result,
  });
  if (
    (locals.questionRenderContext === 'manual_grading' ||
      locals.questionRenderContext === 'ai_grading') &&
    question?.show_correct_answer
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

  const submission = submissions[0] ?? null;
  resultLocals.submissions = submissions;
  resultLocals.submission = submission;

  if (!locals.assessment && locals.question.show_correct_answer && submissionCount > 0) {
    // On instructor question pages, only show if true answer is allowed for this question and there is at least one submission.
    resultLocals.showTrueAnswer = true;
  }

  const effectiveQuestionType = questionServers.getEffectiveQuestionType(locals.question.type);
  resultLocals.effectiveQuestionType = effectiveQuestionType;

  const renderSelection: questionServers.RenderSelection = {
    question: true,
    submissions: submissions.length > 0,
    answer: resultLocals.showTrueAnswer,
  };
  const htmls = await render(
    course,
    renderSelection,
    variant,
    question,
    submission as Submission,
    submissions.slice(0, MAX_RECENT_SUBMISSIONS) as Submission[],
    question_course,
    locals,
  );
  resultLocals.extraHeadersHtml = htmls.extraHeadersHtml;
  resultLocals.questionHtml = htmls.questionHtml;
  resultLocals.submissionHtmls = htmls.submissionHtmls;
  resultLocals.answerHtml = htmls.answerHtml;

  // Load issues last in case rendering produced any new ones.
  resultLocals.issues = await sqldb.queryRows(
    sql.select_issues,
    {
      variant_id: variant.id,
      load_course_data: issuesLoadExtraData,
      load_system_data: issuesLoadExtraData,
    },
    IssueRenderDataSchema,
  );

  if (locals.instance_question) {
    await manualGrading.populateRubricData(locals);
    await async.eachSeries(submissions, manualGrading.populateManualGradingData);
  }

  if (locals.question.type !== 'Freeform') {
    const questionJson = JSON.stringify({
      questionFilePath: urls.calculationQuestionFileUrl,
      questionGeneratedFilePath: urls.calculationQuestionGeneratedFileUrl,
      effectiveQuestionType,
      course,
      courseInstance: course_instance,
      variant: {
        id: variant.id,
        params: variant.params,
      },
      submittedAnswer: submission?.submitted_answer ?? null,
      feedback: submission?.feedback ?? null,
      trueAnswer: resultLocals.showTrueAnswer ? variant.true_answer : null,
      submissions: submissions.length > 0 ? submissions : null,
    });

    const encodedJson = encodeURIComponent(questionJson);
    resultLocals.questionJsonBase64 = Buffer.from(encodedJson).toString('base64');
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
}: {
  unsafe_submission_id: string;
  question: Question;
  instance_question: InstanceQuestionWithAllowGrade | null;
  variant: Variant;
  user: User;
  urlPrefix: string;
  questionContext: QuestionContext;
  questionRenderContext?: QuestionRenderContext;
  authorizedEdit: boolean;
  renderScorePanels: boolean;
  groupRolePermissions: { can_view: boolean; can_submit: boolean } | null;
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
  } = submissionInfo;
  const previous_variants =
    variant.instance_question_id == null || assessment_instance == null
      ? null
      : await selectVariantsByInstanceQuestion({
          assessment_instance_id: assessment_instance.id,
          instance_question_id: variant.instance_question_id,
        });

  const panels: SubmissionPanels = {
    submissionPanel: null,
    extraHeadersHtml: null,
  };

  const locals = {
    urlPrefix,
    plainUrlPrefix: config.urlPrefix,
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
      group_config,
    }),
  };

  await async.parallel([
    async () => {
      // Render the submission panel
      const submissions = [submission];

      const htmls = await render(
        variant_course,
        { answer: renderScorePanels && locals.showTrueAnswer, submissions: true, question: false },
        variant,
        question,
        submission,
        submissions,
        question_course,
        locals,
      );

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
        if (!assessment_instance?.group_id || !group_config) return null;

        return await getGroupInfo(assessment_instance?.group_id, group_config);
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

      if (assessment_instance?.group_id && group_config?.has_roles) {
        nextQuestionGroupRolePermissions = await getQuestionGroupPermissions(
          next_instance_question.id,
          assessment_instance.group_id,
          user.user_id,
        );
        userGroupRoles =
          (await getUserRoles(assessment_instance.group_id, user.user_id))
            .map((role) => role.role_name)
            .join(', ') || 'None';
      }

      panels.questionNavNextButton = QuestionNavSideButton({
        instanceQuestionId: next_instance_question.id,
        sequenceLocked: next_instance_question.sequence_locked,
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
