// @ts-check
import * as async from 'async';
import * as path from 'path';
import * as ejs from 'ejs';
import { differenceInMilliseconds } from 'date-fns';
import * as util from 'util';
import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { generateSignedToken } from '@prairielearn/signed-token';
import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

import { config, setLocalsFromConfig } from './config';
import * as manualGrading from './manualGrading';
import * as questionServers from '../question-servers';
import { getQuestionCourse, ensureVariant } from './question-variant';
import { writeCourseIssues } from './issues';
import {
  AssessmentInstanceSchema,
  AssessmentQuestionSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  CourseInstanceSchema,
  CourseSchema,
  DateFromISOString,
  GradingJobSchema,
  GradingJobStatusSchema,
  IdSchema,
  InstanceQuestionSchema,
  IssueSchema,
  QuestionSchema,
  SubmissionSchema,
  VariantSchema,
} from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

const VariantSelectResultSchema = VariantSchema.extend({
  assessment: AssessmentSchema.nullable(),
  assessment_instance: AssessmentInstanceSchema.extend({
    formatted_date: z.string().nullable(),
  }).nullable(),
  instance_question: InstanceQuestionSchema.extend({
    assigned_grader_name: z.string().nullable(),
    last_grader_name: z.string().nullable(),
  }).nullable(),
  formatted_date: z.string(),
});

const detailedSubmissionColumns = /** @type {const} */ ({
  feedback: true,
  format_errors: true,
  params: true,
  partial_scores: true,
  raw_submitted_answer: true,
  submitted_answer: true,
  true_answer: true,
});

const SubmissionBasicSchema = SubmissionSchema.omit(detailedSubmissionColumns).extend({
  grading_job: GradingJobSchema.nullable(),
  grading_job_id: IdSchema.nullable(),
  grading_job_status: GradingJobStatusSchema.nullable(),
  formatted_date: z.string().nullable(),
  user_uid: z.string().nullable(),
});

const SubmissionDetailedSchema = SubmissionSchema.pick(detailedSubmissionColumns);

const IssueRenderDataSchema = IssueSchema.extend({
  formatted_date: z.string().nullable(),
  user_uid: z.string().nullable(),
  user_name: z.string().nullable(),
});

const SubmissionInfoSchema = z.object({
  grading_job: GradingJobSchema.nullable(),
  submission: SubmissionSchema,
  variant: VariantSchema,
  instance_question: InstanceQuestionSchema.extend({
    allow_grade_left_ms: z.coerce.number(),
    allow_grade_date: DateFromISOString.nullable(),
    allow_grade_interval: z.string(),
  }).nullable(),
  next_instance_question: z.object({
    id: IdSchema.nullable(),
    sequence_locked: z.boolean().nullable(),
  }),
  question: QuestionSchema,
  assessment_question: AssessmentQuestionSchema.nullable(),
  assessment_instance: AssessmentInstanceSchema.nullable(),
  assessment: AssessmentSchema.nullable(),
  assessment_set: AssessmentSetSchema.nullable(),
  course_instance: CourseInstanceSchema.nullable(),
  variant_course: CourseSchema,
  question_course: CourseSchema,
  grading_job_id: IdSchema.nullable(),
  grading_job_status: GradingJobStatusSchema.nullable(),
  formatted_date: z.string(),
  user_uid: z.string().nullable(),
  submission_index: z.coerce.number(),
  submission_count: z.coerce.number(),
});

/**
 * @typedef {Object} SubmissionPanels
 * @property {string?} submissionPanel
 * @property {string?} scorePanel
 * @property {string?} [answerPanel]
 * @property {string?} [questionScorePanel]
 * @property {string?} [assessmentScorePanel]
 * @property {string?} [questionPanelFooter]
 * @property {string?} [questionNavNextButton]
 */

/**
 * @typedef {z.infer<typeof SubmissionBasicSchema> & Partial<z.infer<typeof SubmissionDetailedSchema>>} SubmissionForRender
 * @property {ReturnType<buildGradingJobStats>} grading_job_stats
 * @property {number} submission_number
 */

/**
 * To improve performance, we'll only render at most three submissions on page
 * load. If the user requests more, we'll render them on the fly.
 */
const MAX_RECENT_SUBMISSIONS = 3;

/**
 * Renders the HTML for a variant.
 * @protected
 *
 * @param variant_course - The course for the variant.
 * @param renderSelection - Specify which panels should be rendered.
 * @param variant - The variant to submit to.
 * @param question - The question for the variant.
 * @param submission - The current submission to the variant.
 * @param submissions - The full list of submissions to the variant.
 * @param question_course - The course for the question.
 * @param locals - The current locals for the page response.
 * @type {(variant_course: import('./db-types').Course, ...a: Parameters<import('../question-servers').QuestionServer['render']>) => Promise<import('../question-servers').RenderResultData>}
 */
async function render(
  variant_course,
  renderSelection,
  variant,
  question,
  submission,
  submissions,
  question_course,
  locals,
) {
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
  // locals.authn_user may not be populated when rendering a panel
  const user_id = locals && locals.authn_user ? locals.authn_user.user_id : null;
  await writeCourseIssues(courseIssues, variant, user_id, studentMessage, courseData);
  return data;
}

/**
 * Internal helper function to generate URLs that are used to render
 * question panels.
 *
 * @param  {String} urlPrefix The prefix of the generated URLs.
 * @param  {import('./db-types').Variant} variant The variant object for this question.
 * @param  {import('./db-types').Question} question The question.
 * @param  {import('./db-types').InstanceQuestion?} instance_question The instance question.
 * @return {Record<string, any>} An object containing the named URLs.
 */
function buildQuestionUrls(urlPrefix, variant, question, instance_question) {
  const urls = {};

  if (!instance_question) {
    // instructor question pages
    const questionUrl = urlPrefix + '/question/' + question.id + '/';
    urls.questionUrl = questionUrl;
    urls.newVariantUrl = questionUrl + 'preview/';
    urls.tryAgainUrl = questionUrl + 'preview/';
    urls.reloadUrl = questionUrl + 'preview/' + '?variant_id=' + variant.id;
    urls.clientFilesQuestionUrl = questionUrl + 'clientFilesQuestion';

    // necessary for backward compatibility
    urls.calculationQuestionFileUrl = questionUrl + 'file';

    urls.calculationQuestionGeneratedFileUrl =
      questionUrl + 'generatedFilesQuestion/variant/' + variant.id;

    urls.clientFilesCourseUrl = questionUrl + 'clientFilesCourse';
    urls.clientFilesQuestionGeneratedFileUrl =
      questionUrl + 'generatedFilesQuestion/variant/' + variant.id;
    urls.baseUrl = urlPrefix;
  } else {
    // student question pages
    const iqUrl = urlPrefix + '/instance_question/' + instance_question.id + '/';
    urls.questionUrl = iqUrl;
    urls.newVariantUrl = iqUrl;
    urls.tryAgainUrl = iqUrl;
    urls.reloadUrl = iqUrl + '?variant_id=' + variant.id;
    urls.clientFilesQuestionUrl = iqUrl + 'clientFilesQuestion';

    // necessary for backward compatibility
    urls.calculationQuestionFileUrl = iqUrl + 'file';

    urls.calculationQuestionGeneratedFileUrl =
      iqUrl + 'generatedFilesQuestion/variant/' + variant.id;

    urls.clientFilesCourseUrl = iqUrl + 'clientFilesCourse';
    urls.clientFilesQuestionGeneratedFileUrl =
      iqUrl + 'generatedFilesQuestion/variant/' + variant.id;
    urls.baseUrl = urlPrefix;
  }

  if (variant.workspace_id) {
    urls.workspaceUrl = `/pl/workspace/${variant.workspace_id}`;
  }

  return urls;
}

function buildLocals(
  variant,
  question,
  instance_question,
  assessment,
  assessment_instance,
  assessment_question,
  authz_result,
) {
  const locals = {};

  locals.showGradeButton = false;
  locals.showSaveButton = false;
  locals.disableGradeButton = false;
  locals.disableSaveButton = false;
  locals.showNewVariantButton = false;
  locals.showTryAgainButton = false;
  locals.showSubmissions = false;
  locals.showFeedback = false;
  locals.showTrueAnswer = false;
  locals.showGradingRequested = false;
  locals.allowAnswerEditing = false;
  locals.hasAttemptsOtherVariants = false;
  locals.variantAttemptsLeft = 0;
  locals.variantAttemptsTotal = 0;
  locals.submissions = [];

  if (!assessment) {
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
        locals.variantAttemptsLeft = assessment_question.tries_per_variant - variant.num_tries;
        locals.variantAttemptsTotal = assessment_question.tries_per_variant;
      }
      if (question.single_variant && instance_question.score_perc >= 100.0) {
        locals.showTrueAnswer = true;
      }
    }
    if (assessment.type === 'Exam') {
      if (assessment_instance.open && instance_question.open) {
        locals.showGradeButton = true;
        locals.showSaveButton = true;
        locals.allowAnswerEditing = true;
        locals.variantAttemptsLeft = instance_question.points_list.length;
        locals.variantAttemptsTotal = instance_question.points_list_original.length;
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

  locals.showFeedback = true;
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

  // Used for "auth" for external grading realtime results
  // ID is coerced to a string so that it matches what we get back from the client
  locals.variantToken = generateSignedToken({ variantId: variant.id.toString() }, config.secretKey);

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

  if (
    assessment?.group_config?.has_roles &&
    !instance_question?.group_role_permissions?.can_submit
  ) {
    locals.disableGradeButton = true;
    locals.disableSaveButton = true;
  }

  return locals;
}

/**
 * Render all information needed for a question.
 *
 * @param {string | null} variant_id - The variant to render, or null if it should be generated.
 * @param {string | null} variant_seed - Random seed for variant, or null if it should be generated.
 * @param {Object} locals - The current locals structure to read/write.
 */
export async function getAndRenderVariant(variant_id, variant_seed, locals) {
  locals.question_course = await getQuestionCourse(locals.question, locals.course);

  if (variant_id != null) {
    locals.variant = await sqldb.queryOptionalRow(
      sql.select_variant_for_render,
      {
        variant_id,
        question_id: locals.question.id,
        instance_question_id: locals.instance_question?.id,
      },
      VariantSelectResultSchema,
    );
    if (locals.variant == null) {
      throw error.make(404, 'Variant not found');
    }
  } else {
    const require_open = locals.assessment && locals.assessment.type !== 'Exam';
    const instance_question_id = locals.instance_question?.id;
    const course_instance_id = locals.course_instance_id ?? locals.course_instance?.id ?? null;
    const options = { variant_seed };
    locals.variant = await ensureVariant(
      locals.question.id,
      instance_question_id,
      locals.user.user_id,
      locals.authn_user.user_id,
      course_instance_id,
      locals.course,
      locals.question_course,
      options,
      require_open,
      locals.client_fingerprint_id,
    );
  }

  const {
    urlPrefix,
    variant,
    question,
    instance_question,
    assessment,
    assessment_instance,
    assessment_question,
    authz_result,
  } = locals;

  const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
  Object.assign(locals, urls);

  const newLocals = buildLocals(
    variant,
    question,
    instance_question,
    assessment,
    assessment_instance,
    assessment_question,
    authz_result,
  );
  Object.assign(locals, newLocals);
  if (locals.manualGradingInterface && question?.show_correct_answer) {
    locals.showTrueAnswer = true;
  }

  // We only fully render a small number of submissions on initial page
  // load; the rest only require basic information like timestamps. As
  // such, we'll load submissions in two passes: we'll load basic
  // information for all submissions to this variant, and then we'll
  // load the full submission for only the submissions that we'll
  // actually render.
  const submissions = await sqldb.queryRows(
    sql.select_basic_submissions,
    { variant_id: locals.variant.id, req_date: locals.req_date },
    SubmissionBasicSchema,
  );
  const submissionCount = submissions.length;

  if (submissionCount >= 1) {
    // Load detailed information for the submissions that we'll render.
    // Note that for non-Freeform questions, we unfortunately have to
    // eagerly load detailed data for all submissions, as that ends up
    // being serialized in the HTML. v2 questions don't have any easy
    // way to support async rendering of submissions.
    const needsAllSubmissions = locals.question.type !== 'Freeform';
    const submissionsToRender = needsAllSubmissions
      ? submissions
      : submissions.slice(0, MAX_RECENT_SUBMISSIONS);
    const submissionDetails = await sqldb.queryRows(
      sql.select_detailed_submissions,
      { submission_ids: submissionsToRender.map((s) => s.id) },
      SubmissionDetailedSchema,
    );

    locals.submissions = /** @type {SubmissionForRender[]} */ (
      submissions.map((s, idx) => ({
        grading_job_stats: buildGradingJobStats(s.grading_job),
        submission_number: submissionCount - idx,
        ...s,
        // Both queries order results consistently, so we can just use
        // the array index to match up the basic and detailed results.
        ...(idx < submissionDetails.length ? submissionDetails[idx] : {}),
      }))
    );
    locals.submission = locals.submissions[0]; // most recent submission

    locals.showSubmissions = true;
    if (!locals.assessment && locals.question.show_correct_answer) {
      // instructor question pages, only show if true answer is
      // allowed by this question
      locals.showTrueAnswer = true;
    }
  }

  locals.effectiveQuestionType = questionServers.getEffectiveQuestionType(locals.question.type);

  const renderSelection = {
    header: true,
    question: true,
    submissions: locals.showSubmissions,
    answer: locals.showTrueAnswer,
  };
  const htmls = await render(
    locals.course,
    renderSelection,
    locals.variant,
    locals.question,
    locals.submission,
    locals.submissions.slice(0, MAX_RECENT_SUBMISSIONS),
    locals.question_course,
    locals,
  );
  locals.extraHeadersHtml = htmls.extraHeadersHtml;
  locals.questionHtml = htmls.questionHtml;
  locals.submissionHtmls = htmls.submissionHtmls;
  locals.answerHtml = htmls.answerHtml;

  // Load issues last in case there are issues from rendering.
  //
  // We'll only load the data that will be needed for this specific page render.
  // The checks here should match those in `pages/partials/question.ejs`.
  const loadExtraData = locals.devMode || locals.authz_data.has_course_permission_view;
  locals.issues = await sqldb.queryRows(
    sql.select_issues,
    {
      variant_id: locals.variant.id,
      load_course_data: loadExtraData,
      load_system_data: loadExtraData,
    },
    IssueRenderDataSchema,
  );

  if (locals.instance_question) {
    await manualGrading.populateRubricData(locals);
    await async.each(locals.submissions, manualGrading.populateManualGradingData);
  }

  if (locals.question.type !== 'Freeform') {
    const questionJson = JSON.stringify({
      questionFilePath: locals.calculationQuestionFileUrl,
      questionGeneratedFilePath: locals.calculationQuestionGeneratedFileUrl,
      effectiveQuestionType: locals.effectiveQuestionType,
      course: locals.course,
      courseInstance: locals.course_instance,
      variant: {
        id: locals.variant.id,
        params: locals.variant.params,
      },
      submittedAnswer:
        locals.showSubmissions && locals.submission ? locals.submission.submitted_answer : null,
      feedback: locals.showFeedback && locals.submission ? locals.submission.feedback : null,
      trueAnswer: locals.showTrueAnswer ? locals.variant.true_answer : null,
      submissions: locals.showSubmissions ? locals.submissions : null,
    });

    const encodedJson = encodeURIComponent(questionJson);
    locals.questionJsonBase64 = Buffer.from(encodedJson).toString('base64');
  }
}

/**
 * @param {import('./db-types').GradingJob | null} job
 */
function buildGradingJobStats(job) {
  if (job) {
    /** @type {(number | null)[]} */
    const durations = [];
    const formatDiff = (start, end, addToPhases = true) => {
      const duration = end == null || start == null ? null : differenceInMilliseconds(end, start);
      if (addToPhases) durations.push(duration);
      return duration == null ? '\u2212' : (duration / 1000).toFixed(3).replace(/\.?0+$/, '') + 's';
    };

    const stats = {
      submitDuration: formatDiff(job.grading_requested_at, job.grading_submitted_at),
      queueDuration: formatDiff(job.grading_submitted_at, job.grading_received_at),
      prepareDuration: formatDiff(job.grading_received_at, job.grading_started_at),
      runDuration: formatDiff(job.grading_started_at, job.grading_finished_at),
      reportDuration: formatDiff(job.grading_finished_at, job.graded_at),
      totalDuration: formatDiff(job.grading_requested_at, job.graded_at, false),
    };
    const totalDuration = durations.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) || 1;

    return {
      ...stats,
      phases: durations.map(
        // Round down to avoid width being greater than 100% with floating point errors
        (duration) => Math.floor(((duration ?? 0) * 1000) / totalDuration) / 10,
      ),
    };
  }

  return null;
}

/**
 * Renders the panels that change when a grading job is completed; used to send real-time results
 * back to the client. This includes the submission panel by default, and if renderScorePanels is
 * set, also the side panels for score, navigation and the question footer.
 *
 * @param {Object} param
 * @param  {string | number} param.submission_id The id of the submission
 * @param  {string | number} param.question_id The id of the question (for authorization check)
 * @param  {string | number | null} param.instance_question_id The id of the instance question (for authorization check)
 * @param  {string | number | null} param.variant_id The id of the variant (for authorization check)
 * @param  {String}  param.urlPrefix URL prefix to be used when rendering
 * @param  {String?} param.questionContext The rendering context of this question
 * @param  {String?} param.csrfToken CSRF token for this question page
 * @param  {boolean?} param.authorizedEdit If true the user is authorized to edit the submission
 * @param  {boolean} param.renderScorePanels If true, render all side panels, otherwise only the submission panel
 * @returns {Promise<SubmissionPanels>}
 */
export async function renderPanelsForSubmission({
  submission_id,
  question_id,
  instance_question_id,
  variant_id,
  urlPrefix,
  questionContext,
  csrfToken,
  authorizedEdit,
  renderScorePanels,
}) {
  const submissionInfo = await sqldb.queryOptionalRow(
    sql.select_submission_info,
    { submission_id, question_id, instance_question_id, variant_id },
    SubmissionInfoSchema,
  );
  if (submissionInfo == null) throw error.make(404, 'Not found');

  const {
    variant,
    submission,
    instance_question,
    next_instance_question,
    question,
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
    grading_job_id,
    grading_job_status,
    formatted_date,
    user_uid,
  } = submissionInfo;

  /** @type {SubmissionPanels} */
  const panels = {
    submissionPanel: null,
    scorePanel: null,
  };

  // Fake locals. Yay!
  const locals = { encoded_data: EncodedData };
  setLocalsFromConfig(locals);
  Object.assign(
    locals,
    buildQuestionUrls(urlPrefix, variant, question, instance_question),
    buildLocals(
      variant,
      question,
      instance_question,
      assessment,
      assessment_instance,
      assessment_question,
    ),
  );

  // Using util.promisify on renderFile instead of {async: true} from EJS, because the
  // latter would require all includes in EJS to be translated to await recursively.
  /** @type function */
  let renderFileAsync = util.promisify(ejs.renderFile);
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
      const grading_job_stats = buildGradingJobStats(grading_job);

      panels.answerPanel = locals.showTrueAnswer ? htmls.answerHtml : null;

      await manualGrading.populateRubricData(locals);
      await manualGrading.populateManualGradingData(submission);
      const renderParams = {
        course: question_course,
        course_instance,
        question,
        submission: /** @type {SubmissionForRender} */ ({
          ...submission,
          grading_job,
          grading_job_id,
          grading_job_status,
          formatted_date,
          grading_job_stats,
          user_uid,
          submission_number: submission_index,
        }),
        submissionHtml: htmls.submissionHtmls[0],
        submissionCount: submission_count,
        expanded: true,
        urlPrefix,
        plainUrlPrefix: config.urlPrefix,
      };
      const templatePath = path.join(__dirname, '..', 'pages', 'partials', 'submission.ejs');
      panels.submissionPanel = await renderFileAsync(templatePath, renderParams);
    },
    async () => {
      // Render the question score panel
      if (!renderScorePanels) return;

      // The score panel can and should only be rendered for
      // questions that are part of an assessment
      if (variant.instance_question_id == null) return;

      const renderParams = {
        instance_question,
        assessment_question,
        assessment_instance,
        assessment,
        variant,
        submission,
        __csrf_token: csrfToken,
        authz_result: { authorized_edit: authorizedEdit },
      };
      const templatePath = path.join(
        __dirname,
        '..',
        'pages',
        'partials',
        'questionScorePanel.ejs',
      );
      panels.questionScorePanel = await renderFileAsync(templatePath, renderParams);
    },
    async () => {
      // Render the assessment score panel
      if (!renderScorePanels) return;

      // As usual, only render if this variant is part of an assessment
      if (variant.instance_question_id == null) return;

      const renderParams = {
        assessment_instance,
        assessment,
        assessment_set,
        urlPrefix,
      };

      const templatePath = path.join(
        __dirname,
        '..',
        'pages',
        'partials',
        'assessmentScorePanel.ejs',
      );
      panels.assessmentScorePanel = await renderFileAsync(templatePath, renderParams);
    },
    async () => {
      // Render the question panel footer
      if (!renderScorePanels) return;

      const renderParams = {
        variant,
        question,
        assessment_question,
        instance_question,
        question_context: questionContext,
        __csrf_token: csrfToken,
        authz_result: { authorized_edit: authorizedEdit },
        ...locals,
      };

      const templatePath = path.join(__dirname, '..', 'pages', 'partials', 'questionFooter.ejs');
      panels.questionPanelFooter = await renderFileAsync(templatePath, renderParams);
    },
    async () => {
      if (!renderScorePanels) return;

      // only render if variant is part of assessment
      if (variant.instance_question_id == null) return;

      // Render the next question nav link
      // NOTE: This must be kept in sync with the corresponding code in
      // `pages/partials/questionNavSideButtonGroup.ejs`.
      const renderParams = {
        question: next_instance_question,
        advance_score_perc: assessment_question?.advance_score_perc,
        button: {
          id: 'question-nav-next',
          label: 'Next question',
        },
        ...locals,
        urlPrefix, // needed to get urlPrefix for the course instance, not the site
      };
      const templatePath = path.join(
        __dirname,
        '..',
        'pages',
        'partials',
        'questionNavSideButton.ejs',
      );
      panels.questionNavNextButton = await renderFileAsync(templatePath, renderParams);
    },
  ]);
  return panels;
}

/**
 * Expose the renderer in use to the client so that we can easily see
 * which renderer was used for a given request.
 *
 * @param {import('express').Response} res
 */
export function setRendererHeader(res) {
  const renderer = res.locals.question_renderer;
  if (renderer) {
    res.set('X-PrairieLearn-Question-Renderer', renderer);
  }
}
