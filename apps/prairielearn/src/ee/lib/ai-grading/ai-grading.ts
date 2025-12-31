import assert from 'node:assert';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { type OpenAIResponsesProviderOptions, createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import * as async from 'async';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { formatPrompt, logResponseUsage } from '../../../lib/ai.js';
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
import { assertNever } from '../../../lib/types.js';
import { updateCourseInstanceUsagesForAiGrading } from '../../../models/course-instance-usages.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

import { AI_GRADING_MODEL_PROVIDERS, type AiGradingModelId } from './ai-grading-models.shared.js';
import { selectGradingJobsInfo } from './ai-grading-stats.js';
import {
  type RubricQuestion,
  RubricQuestionSchema,
  containsImageCapture,
  generatePrompt,
  generateSummarizedQuestions,
  insertAiGradingJob,
  parseAiRubricItems,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission
} from './ai-grading-util.js';
import type { AIGradingLog, AIGradingLogger } from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const PARALLEL_SUBMISSION_GRADING_LIMIT = 10;

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
  });

  serverJob.executeInBackground(async (job) => {
    if (!assessment_question.max_manual_points) {
      job.fail('The assessment question has no manual grading');
    }
    const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
      assessment_question_id: assessment_question.id,
    });

    job.info(`Using model ${model_id} for AI grading.`);

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
    job.info(`Found ${instance_questions.length} submissions to grade!`);

    const rubricItemQuestions: Record<string, any> = {};

    const questionsPerRubricItem: Record<string, RubricQuestion[]> = {};

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
      const render_question_results = await questionModule.render(
        { question: true, submissions: false, answer: true },
        variant,
        question,
        null,
        [],
        question_course,
        locals,
      );
      if (render_question_results.courseIssues.length > 0) {
        logger.error(render_question_results.courseIssues.toString());
        logger.error('Errors occurred while AI grading, see output for details');
        return false;
      }
      const questionPrompt = render_question_results.data.questionHtml;
      const questionAnswer = render_question_results.data.answerHtml;

      const render_submission_results = await questionModule.render(
        { question: false, submissions: true, answer: false },
        variant,
        question,
        submission,
        [submission],
        question_course,
        locals,
      );
      const submission_text = render_submission_results.data.submissionHtmls[0];

      const hasImage = containsImageCapture(submission_text);

      const { rubric, rubric_items } = await selectCompleteRubric(assessment_question.id);

      const input = await generatePrompt({
        questionPrompt,
        questionAnswer,
        submission_text,
        submitted_answer: submission.submitted_answer,
        rubric_items,
        grader_guidelines: rubric?.grader_guidelines ?? null,
        model_id,
      });

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
        let RubricQuestionsSchema = z.object({});
        for (const item of rubric_items) {
          RubricGradingItemsSchema = RubricGradingItemsSchema.merge(
            z.object({
              [item.description]: z.boolean(),
            }),
          );

          RubricQuestionsSchema = RubricQuestionsSchema.merge(
            z.object({
              [item.description]: RubricQuestionSchema
            }),
          );
        }


        // OpenAI will take the property descriptions into account. See the
        // examples here: https://platform.openai.com/docs/guides/structured-outputs
        const RubricGradingResultSchema = z.object({
          explanation: z.string().describe(explanationDescription),
          rubric_items: RubricGradingItemsSchema,
          rubric_questions: RubricQuestionsSchema.describe(
            formatPrompt([
              'The rubric may be underspecified or imperfect, and will be iteratively improved through the grading process.',
              'For each rubric item, provide any questions you have about the rubric item.',
              'An instructor will answer the question.',
              'You will get to use the instructor\'s answer to re-grade the submission later.',
              'Additionally, cite verbatim the relevant part of the rubric item,',
              'and cite verbatim the part of the student submission that this question relates to.',
              'Also briefly explain how this would impact the selection or deselection of this rubric item.'
            ])
          )
        });

        const response = await generateObject({
          model,
          schema: RubricGradingResultSchema,
          messages: input,
          providerOptions: {
            openai: openaiProviderOptions,
          },
        });

        logResponseUsage({ response, logger });

        rubricItemQuestions[instance_question.id] = response.object.rubric_questions;

        for (const [itemDescription, rubricQuestion] of Object.entries(response.object.rubric_questions)) {
          if (!(itemDescription in questionsPerRubricItem)) {
            questionsPerRubricItem[itemDescription] = [];
          }
          questionsPerRubricItem[itemDescription].push(rubricQuestion as RubricQuestion);
        }

        logger.info(`Parsed response: ${JSON.stringify(response.object, null, 2)}`);
        const { appliedRubricItems, appliedRubricDescription } = parseAiRubricItems({
          ai_rubric_items: response.object.rubric_items,
          rubric_items,
        });

        if (shouldUpdateScore) {
          // Requires grading: update instance question score
          const manual_rubric_data = {
            rubric_id: rubric_items[0].rubric_id,
            applied_rubric_items: appliedRubricItems,
          };
          await runInTransactionAsync(async () => {
            const { grading_job_id } = await manualGrading.updateInstanceQuestionScore(
              assessment,
              instance_question.id,
              submission.id,
              null, // check_modified_at
              {
                // TODO: consider asking for and recording freeform feedback.
                manual_rubric_data,
                feedback: { manual: '' },
              },
              user_id,
              true, // is_ai_graded
            );
            assert(grading_job_id);

            await insertAiGradingJob({
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              response,
              course_id: course.id,
              course_instance_id: course_instance.id,
            });

            await updateCourseInstanceUsagesForAiGrading({
              gradingJobId: grading_job_id,
              authnUserId: authn_user_id,
              model: model_id,
              usage: response.usage,
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

            await insertAiGradingJob({
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              response,
              course_id: course.id,
              course_instance_id: course_instance.id,
            });

            await updateCourseInstanceUsagesForAiGrading({
              gradingJobId: grading_job_id,
              authnUserId: authn_user_id,
              model: model_id,
              usage: response.usage,
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

        const response = await generateObject({
          model,
          schema: GradingResultSchema,
          messages: input,
          providerOptions: {
            openai: openaiProviderOptions,
          },
        });

        logResponseUsage({ response, logger });

        logger.info(`Parsed response: ${JSON.stringify(response.object, null, 2)}`);
        const score = response.object.score;

        if (shouldUpdateScore) {
          // Requires grading: update instance question score
          const feedback = response.object.feedback;
          await runInTransactionAsync(async () => {
            const { grading_job_id } = await manualGrading.updateInstanceQuestionScore(
              assessment,
              instance_question.id,
              submission.id,
              null, // check_modified_at
              {
                manual_score_perc: score,
                feedback: { manual: feedback },
              },
              user_id,
              true, // is_ai_graded
            );
            assert(grading_job_id);

            await insertAiGradingJob({
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              response,
              course_id: course.id,
              course_instance_id: course_instance.id,
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
            await insertAiGradingJob({
              grading_job_id,
              job_sequence_id: serverJob.jobSequenceId,
              model_id,
              prompt: input,
              response,
              course_id: course.id,
              course_instance_id: course_instance.id,
            });
          });
        }

        logger.info(`AI score: ${response.object.score}`);
      }

      return true;
    };

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
          return await gradeInstanceQuestion(instance_question, logger);
        } catch (err: any) {
          logger.error(err);
          return false;
        } finally {
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

    job.info(`Rubric item questions: ${JSON.stringify(rubricItemQuestions, null, 2)}`);

    job.info(`questionsPerRubricItem: ${JSON.stringify(questionsPerRubricItem, null, 2)}`);

    const summarizedQuestions = await generateSummarizedQuestions({
      questionsPerRubricItem,
      model
    });

    job.info(`Summarized questions: ${JSON.stringify(summarizedQuestions, null, 2)}`);

    if (error_count > 0) {
      job.error('\nNumber of errors: ' + error_count);
      job.fail('Errors occurred while AI grading, see output for details');
    }
  });
  return serverJob.jobSequenceId;
}
