import assert from 'node:assert';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { type OpenAIResponsesProviderOptions, createOpenAI } from '@ai-sdk/openai';
import {
  type GenerateObjectResult,
  type JSONParseError,
  type ModelMessage,
  type TypeValidationError,
  generateObject,
} from 'ai';
import * as async from 'async';
import mustache from 'mustache';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryScalar, runInTransactionAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import {
  calculateCostWithFeeMilliDollars,
  formatMilliDollars,
} from '../../../lib/ai-grading-credits.js';
import {
  type AiImageGradingResponses,
  calculateResponseCost,
  logResponseUsage,
  logResponsesUsage,
} from '../../../lib/ai-util.js';
import { config } from '../../../lib/config.js';
import {
  type Assessment,
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  type InstanceQuestion,
  type Question,
} from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { emitServerJobProgressUpdate } from '../../../lib/serverJobProgressSocket.js';
import { JobItemStatus } from '../../../lib/serverJobProgressSocket.shared.js';
import {
  insertAiGradingJobAndDeductCreditsIfNeeded,
  selectCreditPool,
} from '../../../models/ai-grading-credit-pool.js';
import { updateCourseInstanceUsagesForAiGradingResponses } from '../../../models/course-instance-usages.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

import { resolveAiGradingKeys } from './ai-grading-credentials.js';
import { AI_GRADING_MODEL_PROVIDERS, type AiGradingModelId } from './ai-grading-models.shared.js';
import { selectGradingJobsInfo } from './ai-grading-stats.js';
import {
  addAiGradingCostToIntervalUsage,
  containsImageCapture,
  correctGeminiMalformedRubricGradingJson,
  correctImagesOrientation,
  extractSubmissionImages,
  generatePrompt,
  getIntervalUsage,
  insertAiGradingJob,
  insertAiGradingJobWithRotationCorrection,
  parseAiRubricItems,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';
import {
  type AIGradingLog,
  type AIGradingLogger,
  type CounterClockwiseRotationDegrees,
  HandwritingOrientationsOutputSchema,
} from './types.js';

const sql = loadSqlEquiv(import.meta.url);

type AiGradingResponsesForPersistence = {
  model_id: AiGradingModelId;
  finalGradingResponse: GenerateObjectResult<any>;
} & (
  | {
      rotationCorrectionApplied: true;
      gradingResponseWithRotationIssue: GenerateObjectResult<any>;
      rotationCorrections: Record<
        string,
        {
          degreesRotated: CounterClockwiseRotationDegrees;
          response: GenerateObjectResult<any>;
        }
      >;
    }
  | {
      rotationCorrectionApplied: false;
      gradingResponseWithRotationIssue?: undefined;
      rotationCorrections?: undefined;
    }
);

interface AiGradingPersistenceContext {
  prompt: ModelMessage[];
  course_instance: CourseInstance;
  instance_question: InstanceQuestion;
  /** Persisted AI grading actions are attributed to the authenticated user, even with a different effective user. */
  authn_user_id: string;
  job_sequence_id: string;
}

/**
 * Calculate the total cost in milli-dollars (with infrastructure fee) for all
 * responses from a single grading operation.
 */
function calculateTotalGradingCostMilliDollars({
  model_id,
  gradingResponseWithRotationIssue,
  rotationCorrections,
  finalGradingResponse,
}: AiGradingResponsesForPersistence): number {
  let totalRawCost = calculateResponseCost({ model: model_id, usage: finalGradingResponse.usage });
  if (gradingResponseWithRotationIssue) {
    totalRawCost += calculateResponseCost({
      model: model_id,
      usage: gradingResponseWithRotationIssue.usage,
    });
  }
  if (rotationCorrections) {
    for (const correction of Object.values(rotationCorrections)) {
      totalRawCost += calculateResponseCost({
        model: model_id,
        usage: correction.response.usage,
      });
    }
  }
  return calculateCostWithFeeMilliDollars(totalRawCost, config.aiGradingInfrastructureFeePercent);
}

async function insertAiGradingJobForResponses({
  grading_job_id,
  persistenceContext,
  responses,
}: {
  grading_job_id: string;
  persistenceContext: Pick<
    AiGradingPersistenceContext,
    'prompt' | 'course_instance' | 'job_sequence_id'
  >;
  responses: AiGradingResponsesForPersistence;
}): Promise<string> {
  const aiGradingJobParams = {
    grading_job_id,
    job_sequence_id: persistenceContext.job_sequence_id,
    model_id: responses.model_id,
    prompt: persistenceContext.prompt,
    course_id: persistenceContext.course_instance.course_id,
    course_instance_id: persistenceContext.course_instance.id,
  };

  if (responses.rotationCorrectionApplied) {
    return await insertAiGradingJobWithRotationCorrection({
      ...aiGradingJobParams,
      gradingResponseWithRotationIssue: responses.gradingResponseWithRotationIssue,
      rotationCorrections: responses.rotationCorrections,
      gradingResponseWithRotationCorrection: responses.finalGradingResponse,
    });
  }

  return await insertAiGradingJob({
    ...aiGradingJobParams,
    response: responses.finalGradingResponse,
  });
}

async function updateInstanceQuestionScoreForAiGrading({
  assessment,
  instance_question_id,
  submission_id,
  authn_user_id,
  score,
}: {
  assessment: Assessment;
  instance_question_id: string;
  submission_id: string;
  authn_user_id: string;
  score: Parameters<typeof manualGrading.updateInstanceQuestionScore>[0]['score'];
}): Promise<string> {
  const { grading_job_id } = await manualGrading.updateInstanceQuestionScore({
    assessment,
    instance_question_id,
    submission_id,
    check_modified_at: null,
    score,
    authn_user_id,
    is_ai_graded: true,
  });
  assert(grading_job_id);
  return grading_job_id;
}

async function insertAiOnlyGradingJob({
  submission_id,
  authn_user_id,
  score,
  manual_points,
  manual_rubric_grading_id,
}: {
  submission_id: string;
  authn_user_id: string;
  score: number;
  manual_points: number;
  manual_rubric_grading_id: string | null;
}): Promise<string> {
  return await queryScalar(
    sql.insert_grading_job,
    {
      submission_id,
      authn_user_id,
      grading_method: 'AI',
      correct: null,
      score,
      auto_points: 0,
      manual_points,
      manual_rubric_grading_id,
      feedback: null,
    },
    IdSchema,
  );
}

/**
 * @returns The amount actually deducted from the credit pool (may be less
 * than the full API cost if the pool was partially depleted). This is the
 * instructor-incurred cost, used for the live cost display.
 */
async function finalizeAiGradingPersistence({
  createGradingJob,
  trackRateLimitAndCost,
  persistenceContext,
  responses,
}: {
  createGradingJob: () => Promise<string>;
  trackRateLimitAndCost: boolean;
  persistenceContext: AiGradingPersistenceContext;
  responses: AiGradingResponsesForPersistence;
}): Promise<number> {
  return await runInTransactionAsync(async () => {
    const grading_job_id = await createGradingJob();
    const costMilliDollars = trackRateLimitAndCost
      ? calculateTotalGradingCostMilliDollars(responses)
      : 0;

    const { deducted_milli_dollars } = await insertAiGradingJobAndDeductCreditsIfNeeded({
      trackRateLimitAndCost,
      course_instance_id: persistenceContext.course_instance.id,
      cost_milli_dollars: costMilliDollars,
      user_id: persistenceContext.authn_user_id,
      assessment_question_id: persistenceContext.instance_question.assessment_question_id,
      reason: `AI graded instance question ${persistenceContext.instance_question.id}`,
      createAiGradingJob: async () =>
        await insertAiGradingJobForResponses({
          grading_job_id,
          persistenceContext,
          responses,
        }),
    });

    await updateCourseInstanceUsagesForAiGradingResponses({
      courseInstanceId: persistenceContext.course_instance.id,
      authnUserId: persistenceContext.authn_user_id,
      model: responses.model_id,
      gradingResponseWithRotationIssue: responses.gradingResponseWithRotationIssue,
      rotationCorrections: responses.rotationCorrections,
      finalGradingResponse: responses.finalGradingResponse,
    });

    return deducted_milli_dollars;
  });
}

const PARALLEL_SUBMISSION_GRADING_LIMIT = 20;
const HOURLY_USAGE_CAP_REACHED_MESSAGE = 'Hourly usage cap reached. Try again later.';
const INSUFFICIENT_CREDITS_MESSAGE = 'Insufficient AI grading credits.';

/**
 * Grade instance questions using AI.
 * The related grading jobs and rubric gradings will be generated,
 * but the instance question scores will only be updated
 * for instance questions that require manual grading
 */
export async function aiGrade({
  course,
  course_instance,
  question,
  assessment,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
  mode,
  instance_question_ids,
  model_id,
}: {
  question: Question;
  course: Course;
  course_instance: CourseInstance;
  assessment: Assessment;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  /** Authenticated user; AI grading persistence is attributed to this actor. */
  authn_user_id: string;
  /** Effective user; used for server job context but not grading actor attribution. */
  user_id: string;
  mode: 'human_graded' | 'all' | 'selected';
  /**
   * Limit grading to the specified instance questions.
   * Only use when mode is 'selected'.
   */
  instance_question_ids?: string[];
  model_id: AiGradingModelId;
}): Promise<string> {
  if (!assessment_question.max_manual_points) {
    throw new error.HttpStatusError(
      400,
      'AI grading is only available on assessment questions that use manual grading.',
    );
  }

  const provider = AI_GRADING_MODEL_PROVIDERS[model_id];
  const resolvedKeys = await resolveAiGradingKeys(course_instance);

  const model = run(() => {
    if (provider === 'openai') {
      if (!resolvedKeys.openai) {
        throw new error.HttpStatusError(403, 'Model not available (OpenAI API key not provided)');
      }
      return createOpenAI({
        apiKey: resolvedKeys.openai.apiKey,
        organization: resolvedKeys.openai.organization ?? undefined,
      })(model_id);
    } else if (provider === 'google') {
      if (!resolvedKeys.google) {
        throw new error.HttpStatusError(403, 'Model not available (Google API key not provided)');
      }
      return createGoogleGenerativeAI({
        apiKey: resolvedKeys.google.apiKey,
      })(model_id);
    } else {
      if (!resolvedKeys.anthropic) {
        throw new error.HttpStatusError(
          403,
          'Model not available (Anthropic API key not provided)',
        );
      }
      return createAnthropic({
        apiKey: resolvedKeys.anthropic.apiKey,
      })(model_id);
    }
  });

  const question_course = await getQuestionCourse(question, course);

  const serverJob = await createServerJob({
    type: 'ai_grading',
    description: 'Perform AI grading',
    // Preserve effective-user context for job ownership while also recording the
    // authenticated actor who initiated the AI grading operation.
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: course.id,
    courseInstanceId: course_instance.id,
    assessmentId: assessment.id,
    assessmentQuestionId: assessment_question.id,
  });

  const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessment_question.id,
  });

  const instanceQuestionGradingJobs = await selectGradingJobsInfo(all_instance_questions);

  const instance_questions = all_instance_questions.filter((instance_question) => {
    switch (mode) {
      case 'human_graded':
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return instanceQuestionGradingJobs[instance_question.id]?.some(
          (job) => job.grading_method === 'Manual',
        );
      case 'all':
        return true;
      case 'selected':
        return instance_question_ids?.includes(instance_question.id);
      default:
        assertNever(mode);
    }
  });

  let item_statuses = instance_questions.reduce(
    (acc, instance_question) => {
      acc[instance_question.id] = JobItemStatus.queued;
      return acc;
    },
    {} as Record<string, JobItemStatus>,
  );

  await emitServerJobProgressUpdate({
    job_sequence_id: serverJob.jobSequenceId,
    num_complete: 0,
    num_failed: 0,
    num_total: instance_questions.length,
    item_statuses,
  });

  serverJob.executeInBackground(async (job) => {
    // Track rate limiting and cost only when using platform API keys, since custom
    // API key users are paying for their own usage and platform limits don't apply.
    const trackRateLimitAndCost = !course_instance.ai_grading_use_custom_api_keys;
    let rateLimitExceeded =
      trackRateLimitAndCost &&
      (await getIntervalUsage(course_instance)) > config.aiGradingRateLimitDollars;
    let hasAiGradingCredits = true;

    // If the rate limit has already been exceeded, log it and exit early.
    if (rateLimitExceeded) {
      job.error("You've reached the hourly usage cap for AI grading. Please try again later.");

      item_statuses = instance_questions.reduce(
        (acc, instance_question) => {
          acc[instance_question.id] = JobItemStatus.failed;
          return acc;
        },
        {} as Record<string, JobItemStatus>,
      );

      await emitServerJobProgressUpdate({
        job_sequence_id: serverJob.jobSequenceId,
        num_complete: instance_questions.length,
        num_failed: instance_questions.length,
        num_total: instance_questions.length,
        job_failure_message: HOURLY_USAGE_CAP_REACHED_MESSAGE,
        item_statuses,
      });
      return;
    }

    // Check credit pool before starting the batch. This is a best-effort
    // check without FOR UPDATE — concurrent batches may both pass this check.
    // Credits are deducted per-submission *after* the API call. If the credit
    // pool becomes empty mid-batch, the deduction clamps to the remaining
    // balance and the grading still succeeds.
    if (trackRateLimitAndCost) {
      const creditPool = await selectCreditPool(course_instance.id);
      if (creditPool.total_milli_dollars <= 0) {
        job.error(
          `${INSUFFICIENT_CREDITS_MESSAGE} Available credits: ${formatMilliDollars(creditPool.total_milli_dollars)}.`,
        );

        item_statuses = instance_questions.reduce(
          (acc, instance_question) => {
            acc[instance_question.id] = JobItemStatus.failed;
            return acc;
          },
          {} as Record<string, JobItemStatus>,
        );

        await emitServerJobProgressUpdate({
          job_sequence_id: serverJob.jobSequenceId,
          num_complete: instance_questions.length,
          num_failed: instance_questions.length,
          num_total: instance_questions.length,
          job_failure_message: INSUFFICIENT_CREDITS_MESSAGE,
          item_statuses,
        });
        return;
      }
    }

    job.info(`Using model ${model_id} for AI grading.`);
    job.info(`Found ${instance_questions.length} submissions to grade!`);

    /**
     * Grade an individual instance question.
     *
     * TODO: As we bring AI grading into production and scale it up, this function will compete with
     * all other question rendering operations. In the future, we should limit render concurrency
     * to avoid overwhelming the rendering servers.
     *
     * @returns A boolean indicating whether grading was successful or not.
     */
    const gradeInstanceQuestion = async (
      instance_question: InstanceQuestion,
      logger: AIGradingLogger,
    ): Promise<boolean> => {
      if (rateLimitExceeded) {
        logger.error(
          `Skipping instance question ${instance_question.id} since the rate limit has been exceeded.`,
        );
        return false;
      }

      // Since other jobs may be concurrently running, we could exceed the rate limit
      // by 19 requests worth of usage. We are okay with this potential race condition.
      if (
        trackRateLimitAndCost &&
        (await getIntervalUsage(course_instance)) > config.aiGradingRateLimitDollars
      ) {
        logger.error(
          "You've reached the hourly usage cap for AI grading. Please try again later. AI grading jobs that are still in progress will continue to completion.",
        );
        logger.error(
          `Skipping instance question ${instance_question.id} since the rate limit has been exceeded.`,
        );
        rateLimitExceeded = true;
        return false;
      }

      // Best-effort per-submission credit check. No FOR UPDATE lock — this is
      // a read-only guard to avoid making an API call when the pool is already
      // $0. The authoritative deduction happens later under a lock.
      if (trackRateLimitAndCost && hasAiGradingCredits) {
        const pool = await selectCreditPool(course_instance.id);
        if (pool.total_milli_dollars <= 0) {
          hasAiGradingCredits = false;
          logger.error(
            'No credits remaining. Purchase credits on the AI grading settings page. AI grading jobs that are still in progress will continue to completion.',
          );
        }
      }
      if (!hasAiGradingCredits) {
        logger.error(
          `Skipping instance question ${instance_question.id} since there are no credits remaining.`,
        );
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const shouldUpdateScore = !instanceQuestionGradingJobs[instance_question.id]?.some(
        (job) => job.grading_method === 'Manual',
      );

      const { variant, submission } = await selectLastVariantAndSubmission(instance_question.id);

      const locals = {
        ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
        questionRenderContext: 'ai_grading',
      };
      // Get question html
      const questionModule = questionServers.getModule(question.type);
      const render_question_results = await questionModule.render({
        renderSelection: { question: true, submissions: false, answer: true },
        variant,
        question,
        submission: null,
        submissions: [],
        course: question_course,
        locals,
      });
      if (render_question_results.courseIssues.length > 0) {
        logger.error(render_question_results.courseIssues.toString());
        logger.error('Errors occurred while AI grading, see output for details');
        return false;
      }
      const questionPrompt = render_question_results.data.questionHtml;
      const questionAnswer = render_question_results.data.answerHtml;

      const render_submission_results = await questionModule.render({
        renderSelection: { question: false, submissions: true, answer: false },
        variant,
        question,
        submission,
        submissions: [submission],
        course: question_course,
        locals,
      });
      const submission_text = render_submission_results.data.submissionHtmls[0];

      const hasImage = containsImageCapture(submission_text);

      const { rubric, rubric_items } = await selectCompleteRubric(assessment_question.id);

      const mustacheParams = {
        correct_answers: submission.true_answer ?? {},
        params: submission.params ?? {},
        submitted_answers: submission.submitted_answer,
      };
      for (const rubric_item of rubric_items) {
        rubric_item.description = mustache.render(rubric_item.description, mustacheParams);
        rubric_item.explanation = rubric_item.explanation
          ? mustache.render(rubric_item.explanation, mustacheParams)
          : null;
        rubric_item.grader_note = rubric_item.grader_note
          ? mustache.render(rubric_item.grader_note, mustacheParams)
          : null;
      }

      let input = await generatePrompt({
        questionPrompt,
        questionAnswer,
        submission_text,
        submitted_answer: submission.submitted_answer,
        rubric_items,
        grader_guidelines: rubric?.grader_guidelines ?? null,
        params: variant.params ?? {},
        true_answer: variant.true_answer ?? {},
        model_id,
      });

      const submittedImages = submission.submitted_answer
        ? extractSubmissionImages({
            submission_text,
            submitted_answer: submission.submitted_answer,
          })
        : {};

      // If the submission contains images, prompt the model to transcribe any relevant information
      // out of the image.
      const explanationDescription = run(() => {
        const parts = ['Instructor-facing explanation of the grading decision.'];
        if (hasImage) {
          parts.push(
            'You MUST include a complete transcription of all relevant text, numbers, and information from any images the student submitted.',
            'You MUST transcribe the final answer(s) from the images.',
            'You MUST use LaTeX formatting for mathematical expressions, equations, and formulas.',
            'You MUST wrap inline LaTeX in dollar signs ($).',
            'You MUST wrap block LaTeX in double dollar signs ($$).',
          );
        }
        return parts.join(' ');
      });

      const openaiProviderOptions: OpenAIResponsesProviderOptions = {
        strictJsonSchema: true,
        metadata: {
          course_id: course.id,
          course_instance_id: course_instance.id,
          assessment_id: assessment.id,
          assessment_question_id: assessment_question.id,
          instance_question_id: instance_question.id,
        },
        promptCacheKey: `assessment_question_${assessment_question.id}`,
        safetyIdentifier: `course_${course.id}`,
      };

      if (rubric_items.length > 0) {
        // Dynamically generate the rubric schema based on the rubric items.
        let RubricGradingItemsSchema = z.object({}) as z.ZodObject<Record<string, z.ZodBoolean>>;
        for (const item of rubric_items) {
          RubricGradingItemsSchema = RubricGradingItemsSchema.merge(
            z.object({
              [item.description]: z.boolean(),
            }),
          );
        }

        // OpenAI will take the property descriptions into account. See the
        // examples here: https://developers.openai.com/api/docs/guides/structured-outputs
        const RubricGradingResultSchema = z.object({
          explanation: z.string().describe(explanationDescription),
          // rubric_items must be the last property in the schema.
          // Google Gemini models may output malformed JSON. correctGeminiMalformedRubricGradingJson,
          // the function that attempts to repair the JSON, depends on rubric_items being at the end of
          // generated response.
          rubric_items: RubricGradingItemsSchema,
        });

        const RubricImageGradingResultSchema = RubricGradingResultSchema.merge(
          HandwritingOrientationsOutputSchema,
        );

        const {
          gradingResponseWithRotationIssue,
          rotationCorrections,
          finalGradingResponse,
          rotationCorrectionApplied,
        } = (await run(async () => {
          const experimental_repairText: (options: {
            text: string;
            error: JSONParseError | TypeValidationError;
          }) => Promise<string | null> = async (options) => {
            if (provider !== 'google' || options.error.name !== 'AI_JSONParseError') {
              return null;
            }
            // If a JSON parse error occurs with a Google Gemini model, we attempt to correct
            // unescaped backslashes in the rubric item keys of the response.

            // TODO: Remove this temporary fix once Google fixes the underlying issue.
            // Issue on the Google GenAI repository: https://github.com/googleapis/js-genai/issues/1226#issue-3783507624
            return correctGeminiMalformedRubricGradingJson(options.text);
          };

          if (
            !hasImage ||
            !submission.submitted_answer ||
            // Empirical testing demonstrated that rotation correction
            // was highly effective only for Gemini models.
            provider !== 'google'
          ) {
            return {
              finalGradingResponse: await generateObject({
                model,
                schema: RubricGradingResultSchema,
                messages: input,
                experimental_repairText,
                providerOptions: {
                  openai: openaiProviderOptions,
                },
              }),
              rotationCorrectionApplied: false,
            };
          }

          const initialResponse = await generateObject({
            model,
            schema: RubricImageGradingResultSchema,
            messages: input,
            experimental_repairText,
            providerOptions: {
              openai: openaiProviderOptions,
            },
          });

          if (
            initialResponse.object.handwriting_orientations.every(
              (orientation) => orientation === 'Upright (0 degrees)',
            )
          ) {
            // All images are upright, no rotation correction needed.
            return { finalGradingResponse: initialResponse, rotationCorrectionApplied: false };
          }
          // Otherwise, correct all image orientations.

          // Note: The LLM isn't aware of an identifier (e.g. filename) for each submitted image,
          // so we assume all images might need correction. If an image is already upright, the
          // correction process will keep the image the same.

          const { rotatedSubmittedAnswer, rotationCorrections } = await correctImagesOrientation({
            submittedAnswer: submission.submitted_answer,
            submittedImages,
            model,
          });

          const rotationCorrected = Object.values(rotationCorrections).some(
            (correction) => correction.degreesRotated !== 0,
          );
          // TODO: Return initialResponse if rotationCorrected == false, and modify corresponding cost tracking/rate limiting logic.

          // Regenerate the prompt with the rotation-corrected images.
          input = await generatePrompt({
            questionPrompt,
            questionAnswer,
            rotationCorrected,
            submission_text,
            submitted_answer: rotatedSubmittedAnswer,
            rubric_items,
            grader_guidelines: rubric?.grader_guidelines ?? null,
            params: variant.params ?? {},
            true_answer: variant.true_answer ?? {},
            model_id,
          });

          // Perform grading with the rotation-corrected images.
          const finalResponse = await generateObject({
            model,
            schema: RubricImageGradingResultSchema,
            messages: input,
            experimental_repairText,
            providerOptions: {
              openai: openaiProviderOptions,
            },
          });

          return {
            rotationCorrectionApplied: true,
            gradingResponseWithRotationIssue: initialResponse,
            rotationCorrections,
            finalGradingResponse: finalResponse,
          };
        })) satisfies AiImageGradingResponses;

        if (rotationCorrectionApplied) {
          logResponsesUsage({
            responses: [
              ...Object.values(rotationCorrections).map((r) => r.response),
              gradingResponseWithRotationIssue,
              finalGradingResponse,
            ],
            logger,
          });
          if (trackRateLimitAndCost) {
            for (const response of [
              ...Object.values(rotationCorrections).map((r) => r.response),
              gradingResponseWithRotationIssue,
              finalGradingResponse,
            ]) {
              await addAiGradingCostToIntervalUsage({
                courseInstance: course_instance,
                model: model_id,
                usage: response.usage,
              });
            }
          }
        } else {
          logResponseUsage({ response: finalGradingResponse, logger });
          if (trackRateLimitAndCost) {
            await addAiGradingCostToIntervalUsage({
              courseInstance: course_instance,
              model: model_id,
              usage: finalGradingResponse.usage,
            });
          }
        }

        logger.info(`Parsed response: ${JSON.stringify(finalGradingResponse.object, null, 2)}`);
        const { appliedRubricItems, appliedRubricDescription } = parseAiRubricItems({
          ai_rubric_items: finalGradingResponse.object.rubric_items,
          rubric_items,
        });
        const responsesForPersistence: AiGradingResponsesForPersistence = rotationCorrectionApplied
          ? {
              model_id,
              rotationCorrectionApplied,
              gradingResponseWithRotationIssue,
              rotationCorrections,
              finalGradingResponse,
            }
          : { model_id, rotationCorrectionApplied, finalGradingResponse };
        const persistenceContext = {
          prompt: input,
          course_instance,
          instance_question,
          authn_user_id,
          job_sequence_id: serverJob.jobSequenceId,
        } satisfies AiGradingPersistenceContext;

        const deductedCost = await run(async () => {
          if (shouldUpdateScore) {
            // Requires grading: update instance question score
            const manual_rubric_data = {
              rubric_id: rubric_items[0].rubric_id,
              applied_rubric_items: appliedRubricItems,
            };
            return await finalizeAiGradingPersistence({
              createGradingJob: async () =>
                await updateInstanceQuestionScoreForAiGrading({
                  assessment,
                  instance_question_id: instance_question.id,
                  submission_id: submission.id,
                  score: {
                    // TODO: consider asking for and recording freeform feedback.
                    manual_rubric_data,
                    feedback: { manual: '' },
                  },
                  authn_user_id,
                }),
              trackRateLimitAndCost,
              persistenceContext,
              responses: responsesForPersistence,
            });
          } else {
            // Does not require grading: only create grading job and rubric grading
            return await finalizeAiGradingPersistence({
              createGradingJob: async () => {
                assert(assessment_question.max_manual_points);
                const manual_rubric_grading = await manualGrading.insertRubricGrading(
                  rubric_items[0].rubric_id,
                  assessment_question.max_points ?? 0,
                  assessment_question.max_manual_points,
                  appliedRubricItems,
                  0,
                );
                const score =
                  manual_rubric_grading.computed_points / assessment_question.max_manual_points;
                return await insertAiOnlyGradingJob({
                  submission_id: submission.id,
                  authn_user_id,
                  score,
                  manual_points: manual_rubric_grading.computed_points,
                  manual_rubric_grading_id: manual_rubric_grading.id,
                });
              },
              trackRateLimitAndCost,
              persistenceContext,
              responses: responsesForPersistence,
            });
          }
        });

        if (trackRateLimitAndCost) {
          total_cost_milli_dollars += deductedCost;
          num_items_incurred_cost += 1;
        }

        logger.info('AI rubric items:');

        for (const item of appliedRubricDescription) {
          logger.info(`- ${item}`);
        }
      } else {
        // OpenAI will take the property descriptions into account. See the
        // examples here: https://platform.openai.com/docs/guides/structured-outputs
        const GradingResultSchema = z.object({
          explanation: z.string().describe(explanationDescription),
          feedback: z
            .string()
            .describe(
              'Student-facing feedback on their submission. Address the student as "you". Use an empty string if the student\'s response is entirely correct.',
            ),
          score: z
            .number()
            .int()
            .min(0)
            .max(100)
            .describe(
              'Score as an integer between 0 and 100, where 0 is the lowest and 100 is the highest.',
            ),
        });

        const ImageGradingResultSchema = GradingResultSchema.merge(
          HandwritingOrientationsOutputSchema,
        );

        const {
          rotationCorrectionApplied,
          finalGradingResponse,
          gradingResponseWithRotationIssue,
          rotationCorrections,
        } = (await run(async () => {
          if (
            !hasImage ||
            !submission.submitted_answer ||
            // Empirical testing demonstrated that rotation correction
            // was highly effective only for Gemini models.
            provider !== 'google'
          ) {
            return {
              finalGradingResponse: await generateObject({
                model,
                schema: GradingResultSchema,
                messages: input,
                providerOptions: {
                  openai: openaiProviderOptions,
                },
              }),
              rotationCorrectionApplied: false,
            };
          }

          const initialResponse = await generateObject({
            model,
            schema: ImageGradingResultSchema,
            messages: input,
            providerOptions: {
              openai: openaiProviderOptions,
            },
          });

          if (
            initialResponse.object.handwriting_orientations.every(
              (orientation) => orientation === 'Upright (0 degrees)',
            )
          ) {
            // All images are upright, no rotation correction needed.
            return { finalGradingResponse: initialResponse, rotationCorrectionApplied: false };
          }

          const { rotatedSubmittedAnswer, rotationCorrections } = await correctImagesOrientation({
            submittedAnswer: submission.submitted_answer,
            submittedImages,
            model,
          });

          // Regenerate the prompt with the rotation-corrected images.
          input = await generatePrompt({
            questionPrompt,
            questionAnswer,
            submission_text,
            submitted_answer: rotatedSubmittedAnswer,
            rubric_items,
            grader_guidelines: rubric?.grader_guidelines ?? null,
            params: variant.params ?? {},
            true_answer: variant.true_answer ?? {},
            model_id,
          });

          // Perform grading with the rotation-corrected images.
          const finalResponse = await generateObject({
            model,
            schema: ImageGradingResultSchema,
            messages: input,
            providerOptions: {
              openai: openaiProviderOptions,
            },
          });

          return {
            rotationCorrectionApplied: true,
            gradingResponseWithRotationIssue: initialResponse,
            rotationCorrections,
            finalGradingResponse: finalResponse,
          };
        })) satisfies AiImageGradingResponses;

        if (rotationCorrectionApplied) {
          logResponsesUsage({
            responses: [
              ...Object.values(rotationCorrections).map((correction) => correction.response),
              gradingResponseWithRotationIssue,
              finalGradingResponse,
            ],
            logger,
          });
          if (trackRateLimitAndCost) {
            for (const response of [
              ...Object.values(rotationCorrections).map((r) => r.response),
              gradingResponseWithRotationIssue,
              finalGradingResponse,
            ]) {
              await addAiGradingCostToIntervalUsage({
                courseInstance: course_instance,
                model: model_id,
                usage: response.usage,
              });
            }
          }
        } else {
          logResponseUsage({ response: finalGradingResponse, logger });
          if (trackRateLimitAndCost) {
            await addAiGradingCostToIntervalUsage({
              courseInstance: course_instance,
              model: model_id,
              usage: finalGradingResponse.usage,
            });
          }
        }

        logger.info(`Parsed response: ${JSON.stringify(finalGradingResponse.object, null, 2)}`);
        const score = finalGradingResponse.object.score;
        const responsesForPersistence: AiGradingResponsesForPersistence = rotationCorrectionApplied
          ? {
              model_id,
              rotationCorrectionApplied,
              gradingResponseWithRotationIssue,
              rotationCorrections,
              finalGradingResponse,
            }
          : { model_id, rotationCorrectionApplied, finalGradingResponse };
        const persistenceContext = {
          prompt: input,
          course_instance,
          instance_question,
          authn_user_id,
          job_sequence_id: serverJob.jobSequenceId,
        } satisfies AiGradingPersistenceContext;

        const deductedCost = await run(async () => {
          if (shouldUpdateScore) {
            // Requires grading: update instance question score
            const feedback = finalGradingResponse.object.feedback;
            return await finalizeAiGradingPersistence({
              createGradingJob: async () =>
                await updateInstanceQuestionScoreForAiGrading({
                  assessment,
                  instance_question_id: instance_question.id,
                  submission_id: submission.id,
                  score: {
                    manual_score_perc: score,
                    feedback: { manual: feedback },
                  },
                  authn_user_id,
                }),
              trackRateLimitAndCost,
              persistenceContext,
              responses: responsesForPersistence,
            });
          } else {
            // Does not require grading: only create grading job
            return await finalizeAiGradingPersistence({
              createGradingJob: async () => {
                assert(assessment_question.max_manual_points);
                return await insertAiOnlyGradingJob({
                  submission_id: submission.id,
                  authn_user_id,
                  score: score / 100,
                  manual_points: (score * assessment_question.max_manual_points) / 100,
                  manual_rubric_grading_id: null,
                });
              },
              trackRateLimitAndCost,
              persistenceContext,
              responses: responsesForPersistence,
            });
          }
        });

        if (trackRateLimitAndCost) {
          total_cost_milli_dollars += deductedCost;
          num_items_incurred_cost += 1;
        }

        logger.info(`AI score: ${finalGradingResponse.object.score}`);
      }

      return true;
    };

    // No mutex is needed here: mapLimit schedules async work concurrently, but
    // these counters are updated on Node's single-threaded event loop.
    let num_complete = 0;
    let num_failed = 0;
    let total_cost_milli_dollars = 0;
    let num_items_incurred_cost = 0;

    // Grade each instance question and return an array indicating the success/failure of each grading operation.
    const instance_question_grading_successes = await async.mapLimit(
      instance_questions,
      PARALLEL_SUBMISSION_GRADING_LIMIT,
      async (instance_question: InstanceQuestion) => {
        const logs: AIGradingLog[] = [];

        const logger: AIGradingLogger = {
          info: (msg: string) => {
            logs.push({
              messageType: 'info',
              message: msg,
            });
          },
          error: (msg: string) => {
            logs.push({
              messageType: 'error',
              message: msg,
            });
          },
        };

        const costFields = trackRateLimitAndCost
          ? { total_cost_milli_dollars, num_items_incurred_cost }
          : {};

        const getJobFailureMessage = () => {
          if (!hasAiGradingCredits) return INSUFFICIENT_CREDITS_MESSAGE;
          if (rateLimitExceeded) return HOURLY_USAGE_CAP_REACHED_MESSAGE;
          return undefined;
        };

        try {
          item_statuses[instance_question.id] = JobItemStatus.in_progress;
          await emitServerJobProgressUpdate({
            job_sequence_id: serverJob.jobSequenceId,
            num_complete,
            num_failed,
            num_total: instance_questions.length,
            item_statuses,
            job_failure_message: getJobFailureMessage(),
            ...costFields,
          });

          const gradingSuccessful = await gradeInstanceQuestion(instance_question, logger);

          item_statuses[instance_question.id] = gradingSuccessful
            ? JobItemStatus.complete
            : JobItemStatus.failed;

          if (!gradingSuccessful) {
            num_failed += 1;
          }

          return gradingSuccessful;
        } catch (err: any) {
          logger.error(err);
          item_statuses[instance_question.id] = JobItemStatus.failed;
          num_failed += 1;
          return false;
        } finally {
          num_complete += 1;
          await emitServerJobProgressUpdate({
            job_sequence_id: serverJob.jobSequenceId,
            num_complete,
            num_failed,
            num_total: instance_questions.length,
            item_statuses,
            job_failure_message: getJobFailureMessage(),
            ...(trackRateLimitAndCost ? { total_cost_milli_dollars, num_items_incurred_cost } : {}),
          });
          for (const log of logs) {
            switch (log.messageType) {
              case 'info':
                job.info(log.message);
                break;
              case 'error':
                job.error(log.message);
                break;
              default:
                assertNever(log.messageType);
            }
          }
        }
      },
    );

    const error_count = instance_question_grading_successes.filter((success) => !success).length;

    if (error_count > 0) {
      job.error('\nNumber of errors: ' + error_count);
      job.fail('Errors occurred while AI grading, see output for details');
    }
  });
  return serverJob.jobSequenceId;
}
