import assert from 'node:assert';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { type OpenAIResponsesProviderOptions, createOpenAI } from '@ai-sdk/openai';
import { type JSONParseError, type TypeValidationError, generateObject } from 'ai';
import * as async from 'async';
import mustache from 'mustache';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import {
  type AiImageGradingResponses,
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
import { updateCourseInstanceUsagesForAiGradingResponses } from '../../../models/course-instance-usages.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

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
  HandwritingOrientationsOutputSchema,
} from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const PARALLEL_SUBMISSION_GRADING_LIMIT = 20;
const HOURLY_USAGE_CAP_REACHED_MESSAGE = 'Hourly usage cap reached. Try again later.';

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
  authn_user_id: string;
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
  const model = run(() => {
    if (provider === 'openai') {
      // If an OpenAI API Key and Organization are not provided, throw an error
      if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
        throw new error.HttpStatusError(403, 'Model not available (OpenAI API key not provided)');
      }
      const openai = createOpenAI({
        apiKey: config.aiGradingOpenAiApiKey,
        organization: config.aiGradingOpenAiOrganization,
      });
      return openai(model_id);
    } else if (provider === 'google') {
      // If a Google API Key is not provided, throw an error
      if (!config.aiGradingGoogleApiKey) {
        throw new error.HttpStatusError(403, 'Model not available (Google API key not provided)');
      }
      const google = createGoogleGenerativeAI({
        apiKey: config.aiGradingGoogleApiKey,
      });
      return google(model_id);
    } else {
      // If an Anthropic API Key is not provided, throw an error
      if (!config.aiGradingAnthropicApiKey) {
        throw new error.HttpStatusError(
          403,
          'Model not available (Anthropic API key not provided)',
        );
      }
      const anthropic = createAnthropic({
        apiKey: config.aiGradingAnthropicApiKey,
      });
      return anthropic(model_id);
    }
  });

  const question_course = await getQuestionCourse(question, course);

  const serverJob = await createServerJob({
    type: 'ai_grading',
    description: 'Perform AI grading',
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
    let rateLimitExceeded =
      (await getIntervalUsage(course_instance)) > config.aiGradingRateLimitDollars;

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
      const intervalCost = await getIntervalUsage(course_instance);

      if (intervalCost > config.aiGradingRateLimitDollars) {
        logger.error(
          "You've reached the hourly usage cap for AI grading. Please try again later. AI grading jobs that are still in progress will continue to completion.",
        );
        logger.error(
          `Skipping instance question ${instance_question.id} since the rate limit has been exceeded.`,
        );
        rateLimitExceeded = true;
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
        // examples here: https://platform.openai.com/docs/guides/structured-outputs
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
        } else {
          logResponseUsage({ response: finalGradingResponse, logger });
          await addAiGradingCostToIntervalUsage({
            courseInstance: course_instance,
            model: model_id,
            usage: finalGradingResponse.usage,
          });
        }

        logger.info(`Parsed response: ${JSON.stringify(finalGradingResponse.object, null, 2)}`);
        const { appliedRubricItems, appliedRubricDescription } = parseAiRubricItems({
          ai_rubric_items: finalGradingResponse.object.rubric_items,
          rubric_items,
        });

        if (shouldUpdateScore) {
          // Requires grading: update instance question score
          const manual_rubric_data = {
            rubric_id: rubric_items[0].rubric_id,
            applied_rubric_items: appliedRubricItems,
          };
          await runInTransactionAsync(async () => {
            const { grading_job_id } = await manualGrading.updateInstanceQuestionScore({
              assessment,
              instance_question_id: instance_question.id,
              submission_id: submission.id,
              check_modified_at: null,
              score: {
                // TODO: consider asking for and recording freeform feedback.
                manual_rubric_data,
                feedback: { manual: '' },
              },
              authn_user_id: user_id,
              is_ai_graded: true,
            });
            assert(grading_job_id);

            const aiGradingJobParams = {
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              course_id: course.id,
              course_instance_id: course_instance.id,
            };

            if (rotationCorrectionApplied) {
              await insertAiGradingJobWithRotationCorrection({
                ...aiGradingJobParams,
                gradingResponseWithRotationIssue,
                rotationCorrections,
                gradingResponseWithRotationCorrection: finalGradingResponse,
              });
            } else {
              await insertAiGradingJob({
                ...aiGradingJobParams,
                response: finalGradingResponse,
              });
            }

            await updateCourseInstanceUsagesForAiGradingResponses({
              gradingJobId: grading_job_id,
              authnUserId: authn_user_id,
              model: model_id,
              gradingResponseWithRotationIssue,
              rotationCorrections,
              finalGradingResponse,
            });
          });
        } else {
          // Does not require grading: only create grading job and rubric grading
          await runInTransactionAsync(async () => {
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
            const grading_job_id = await queryRow(
              sql.insert_grading_job,
              {
                submission_id: submission.id,
                authn_user_id: user_id,
                grading_method: 'AI',
                correct: null,
                score,
                auto_points: 0,
                manual_points: manual_rubric_grading.computed_points,
                manual_rubric_grading_id: manual_rubric_grading.id,
                feedback: null,
              },
              IdSchema,
            );

            const aiGradingJobParams = {
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              course_id: course.id,
              course_instance_id: course_instance.id,
            };

            if (rotationCorrectionApplied) {
              await insertAiGradingJobWithRotationCorrection({
                ...aiGradingJobParams,
                gradingResponseWithRotationIssue,
                rotationCorrections,
                gradingResponseWithRotationCorrection: finalGradingResponse,
              });
            } else {
              await insertAiGradingJob({
                ...aiGradingJobParams,
                response: finalGradingResponse,
              });
            }

            await updateCourseInstanceUsagesForAiGradingResponses({
              gradingJobId: grading_job_id,
              authnUserId: authn_user_id,
              model: model_id,
              gradingResponseWithRotationIssue,
              rotationCorrections,
              finalGradingResponse,
            });
          });
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
        } else {
          logResponseUsage({ response: finalGradingResponse, logger });
          await addAiGradingCostToIntervalUsage({
            courseInstance: course_instance,
            model: model_id,
            usage: finalGradingResponse.usage,
          });
        }

        logger.info(`Parsed response: ${JSON.stringify(finalGradingResponse.object, null, 2)}`);
        const score = finalGradingResponse.object.score;

        if (shouldUpdateScore) {
          // Requires grading: update instance question score
          const feedback = finalGradingResponse.object.feedback;
          await runInTransactionAsync(async () => {
            const { grading_job_id } = await manualGrading.updateInstanceQuestionScore({
              assessment,
              instance_question_id: instance_question.id,
              submission_id: submission.id,
              check_modified_at: null,
              score: {
                manual_score_perc: score,
                feedback: { manual: feedback },
              },
              authn_user_id: user_id,
              is_ai_graded: true,
            });
            assert(grading_job_id);

            const aiGradingJobParams = {
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              course_id: course.id,
              course_instance_id: course_instance.id,
            };

            if (rotationCorrectionApplied) {
              await insertAiGradingJobWithRotationCorrection({
                ...aiGradingJobParams,
                gradingResponseWithRotationIssue,
                rotationCorrections,
                gradingResponseWithRotationCorrection: finalGradingResponse,
              });
            } else {
              await insertAiGradingJob({
                ...aiGradingJobParams,
                response: finalGradingResponse,
              });
            }

            await updateCourseInstanceUsagesForAiGradingResponses({
              gradingJobId: grading_job_id,
              authnUserId: authn_user_id,
              model: model_id,
              gradingResponseWithRotationIssue,
              rotationCorrections,
              finalGradingResponse,
            });
          });
        } else {
          // Does not require grading: only create grading job and rubric grading
          await runInTransactionAsync(async () => {
            assert(assessment_question.max_manual_points);
            const grading_job_id = await queryRow(
              sql.insert_grading_job,
              {
                submission_id: submission.id,
                authn_user_id: user_id,
                grading_method: 'AI',
                correct: null,
                score: score / 100,
                auto_points: 0,
                manual_points: (score * assessment_question.max_manual_points) / 100,
                manual_rubric_grading_id: null,
                feedback: null,
              },
              IdSchema,
            );

            const aiGradingJobParams = {
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              course_id: course.id,
              course_instance_id: course_instance.id,
            };
            if (rotationCorrectionApplied) {
              await insertAiGradingJobWithRotationCorrection({
                ...aiGradingJobParams,
                gradingResponseWithRotationIssue,
                rotationCorrections,
                gradingResponseWithRotationCorrection: finalGradingResponse,
              });
            } else {
              await insertAiGradingJob({
                ...aiGradingJobParams,
                response: finalGradingResponse,
              });
            }

            await updateCourseInstanceUsagesForAiGradingResponses({
              gradingJobId: grading_job_id,
              authnUserId: authn_user_id,
              model: model_id,
              gradingResponseWithRotationIssue,
              rotationCorrections,
              finalGradingResponse,
            });
          });
        }

        logger.info(`AI score: ${finalGradingResponse.object.score}`);
      }

      return true;
    };

    let num_complete = 0;
    let num_failed = 0;

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

        try {
          item_statuses[instance_question.id] = JobItemStatus.in_progress;
          await emitServerJobProgressUpdate({
            job_sequence_id: serverJob.jobSequenceId,
            num_complete,
            num_failed,
            num_total: instance_questions.length,
            item_statuses,
            job_failure_message: rateLimitExceeded ? HOURLY_USAGE_CAP_REACHED_MESSAGE : undefined,
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
            job_failure_message: rateLimitExceeded ? HOURLY_USAGE_CAP_REACHED_MESSAGE : undefined,
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
