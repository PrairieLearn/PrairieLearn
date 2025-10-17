import assert from 'node:assert';

import { type OpenAIChatLanguageModelOptions, createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import * as async from 'async';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { logResponseUsage } from '../../../lib/ai.js';
import { config } from '../../../lib/config.js';
import {
  type AssessmentQuestion,
  type Course,
  IdSchema,
  type InstanceQuestion,
  type Question,
} from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { assertNever } from '../../../lib/types.js';
import * as questionServers from '../../../question-servers/index.js';

import { selectGradingJobsInfo } from './ai-grading-stats.js';
import {
  AI_GRADING_OPENAI_MODEL,
  containsImageCapture,
  generatePrompt,
  generateSubmissionEmbedding,
  insertAiGradingJob,
  parseAiRubricItems,
  selectClosestSubmissionInfo,
  selectEmbeddingForSubmission,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastSubmissionId,
  selectLastVariantAndSubmission,
  selectRubricForGrading,
} from './ai-grading-util.js';
import type { AIGradingLog, AIGradingLogger } from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const PARALLEL_SUBMISSION_GRADING_LIMIT = 20;

/**
 * Grade instance questions using AI.
 * The related grading jobs and rubric gradings will be generated,
 * but the instance question scores will only be updated
 * for instance questions that require manual grading
 */
export async function aiGrade({
  course,
  course_instance_id,
  question,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
  mode,
  instance_question_ids,
}: {
  question: Question;
  course: Course;
  course_instance_id: string;
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
}): Promise<string> {
  // If OpenAI API Key and Organization are not provided, throw error
  if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
    throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
  }

  const openai = createOpenAI({
    apiKey: config.aiGradingOpenAiApiKey,
    organization: config.aiGradingOpenAiOrganization,
  });
  const embeddingModel = openai.textEmbeddingModel('text-embedding-3-small');
  const model = openai(AI_GRADING_OPENAI_MODEL);

  const question_course = await getQuestionCourse(question, course);

  const serverJob = await createServerJob({
    courseId: course.id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_question.assessment_id,
    authnUserId: authn_user_id,
    userId: user_id,
    type: 'ai_grading',
    description: 'Perform AI grading',
  });

  serverJob.executeInBackground(async (job) => {
    if (!assessment_question.max_manual_points) {
      job.fail('The assessment question has no manual grading');
    }
    const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion({
      assessment_question_id: assessment_question.id,
    });

    job.info('Checking for embeddings for all submissions.');
    let newEmbeddingsCount = 0;
    for (const instance_question of all_instance_questions) {
      // Only checking for instance questions that can be used as RAG data.
      // They should be graded last by a human.
      if (instance_question.requires_manual_grading || instance_question.is_ai_graded) {
        continue;
      }
      const submission_id = await selectLastSubmissionId(instance_question.id);
      const submission_embedding = await selectEmbeddingForSubmission(submission_id);
      if (!submission_embedding) {
        await generateSubmissionEmbedding({
          course,
          question,
          instance_question,
          urlPrefix,
          embeddingModel,
        });
        newEmbeddingsCount++;
      }
    }
    job.info(`Calculated ${newEmbeddingsCount} embeddings.`);

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
    ) => {
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
        logger.info(render_question_results.courseIssues.toString());
        logger.error('Errors occurred while AI grading, see output for details');
        return false;
      }
      const questionPrompt = render_question_results.data.questionHtml;
      const questionAnswer = render_question_results.data.answerHtml;

      let submission_embedding = await selectEmbeddingForSubmission(submission.id);
      if (!submission_embedding) {
        submission_embedding = await generateSubmissionEmbedding({
          course,
          question,
          instance_question,
          urlPrefix,
          embeddingModel,
        });
      }
      const submission_text = submission_embedding.submission_text;

      const hasImage = containsImageCapture(submission_text);

      const example_submissions = await run(async () => {
        // We're currently disabling RAG for submissions that deal with images.
        // It won't make sense to pull graded examples for such questions until we
        // have a strategy for finding similar example submissions based on the
        // contents of the images.
        //
        // Note that this means we're still computing and storing the submission
        // text and embeddings for such submissions, even though they won't be used
        // for RAG. While this means we're unnecessarily spending money on actually
        // generating the embeddings, it does mean that we don't have to special-case
        // image-based questions in the embedding generation code, which keeps things
        // simpler overall.
        if (hasImage) return [];

        return await selectClosestSubmissionInfo({
          submission_id: submission.id,
          assessment_question_id: assessment_question.id,
          embedding: submission_embedding.embedding,
          limit: 5,
        });
      });

      // Log things for visibility and auditing.
      let gradedExampleInfo = `\nInstance question ${instance_question.id}${example_submissions.length > 0 ? '\nThe following instance questions were used as human-graded examples:' : ''}`;
      for (const example of example_submissions) {
        gradedExampleInfo += `\n- ${example.instance_question_id}`;
      }
      logger.info(gradedExampleInfo);

      const rubric_items = await selectRubricForGrading(assessment_question.id);

      const input = await generatePrompt({
        questionPrompt,
        questionAnswer,
        submission_text,
        submitted_answer: submission.submitted_answer,
        example_submissions,
        rubric_items,
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
          rubric_items: RubricGradingItemsSchema,
        });

        const response = await generateObject({
          model,
          schema: RubricGradingResultSchema,
          messages: input,
          providerOptions: {
            openai: {
              metadata: {
                course_id: course.id.toString(),
                course_instance_id: course_instance_id.toString(),
                assessment_id: assessment_question.assessment_id.toString(),
                assessment_question_id: assessment_question.id.toString(),
                instance_question_id: instance_question.id.toString(),
              },
              promptCacheKey: `assessment_question_${assessment_question.id}`,
              safetyIdentifier: `course_${course.id}`,
            } satisfies OpenAIChatLanguageModelOptions,
          },
        });

        try {
          logResponseUsage({ response, logger });

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
                assessment_question.assessment_id,
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
                prompt: input,
                response,
                course_id: course.id,
                course_instance_id,
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
                prompt: input,
                response,
                course_id: course.id,
                course_instance_id,
              });
            });
          }

          logger.info('AI rubric items:');

          for (const item of appliedRubricDescription) {
            logger.info(`- ${item}`);
          }
        } catch (err) {
          logger.error(`ERROR AI grading for ${instance_question.id}`);
          logger.error(err);
          return false;
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
            openai: {
              metadata: {
                course_id: course.id.toString(),
                course_instance_id: course_instance_id.toString(),
                assessment_id: assessment_question.assessment_id.toString(),
                assessment_question_id: assessment_question.id.toString(),
                instance_question_id: instance_question.id.toString(),
              },
              promptCacheKey: `assessment_question_${assessment_question.id}`,
              safetyIdentifier: `course_${course.id}`,
            } satisfies OpenAIChatLanguageModelOptions,
          },
        });
        try {
          logResponseUsage({ response, logger });

          logger.info(`Parsed response: ${JSON.stringify(response.object, null, 2)}`);
          const score = response.object.score;

          if (shouldUpdateScore) {
            // Requires grading: update instance question score
            const feedback = response.object.feedback;
            await runInTransactionAsync(async () => {
              const { grading_job_id } = await manualGrading.updateInstanceQuestionScore(
                assessment_question.assessment_id,
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
                prompt: input,
                response,
                course_id: course.id,
                course_instance_id,
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
                prompt: input,
                response,
                course_id: course.id,
                course_instance_id,
              });
            });
          }

          logger.info(`AI score: ${response.object.score}`);
        } catch (err) {
          logger.error(`ERROR AI grading for ${instance_question.id}`);
          logger.error(err);
          return false;
        }
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
        } catch (err) {
          logger.error(err);
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

    if (error_count > 0) {
      job.error('\nNumber of errors: ' + error_count);
      job.fail('Errors occurred while AI grading, see output for details');
    }
  });
  return serverJob.jobSequenceId;
}
