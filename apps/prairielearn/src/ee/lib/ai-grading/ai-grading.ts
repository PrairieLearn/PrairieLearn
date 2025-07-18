import assert from 'node:assert';

import { Clusters } from '@kanaries/ml';
import * as async from 'async';
import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';

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


import {
  GradingResultSchema,
  OPEN_AI_MODEL,
  OPEN_AI_TEMPERATURE,
  deleteEmbeddingForSubmission,
  generatePrompt,
  generateSubmissionEmbedding,
  insertAiGradingJob,
  parseAiRubricItems,
  selectClosestSubmissionInfo,
  selectEmbeddingForSubmission,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
  selectRubricForGrading
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
  image_rag_enabled = true,
  run_async = true
}: {
  question: Question;
  course: Course;
  course_instance_id?: string;
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
  image_rag_enabled?: boolean; // Whether to use image RAG for AI grading
  run_async?: boolean;
}): Promise<string> {
  // If OpenAI API Key and Organization are not provided, throw error
  if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
    throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
  }
  const openai = new OpenAI({
    apiKey: config.aiGradingOpenAiApiKey,
    organization: config.aiGradingOpenAiOrganization,
  });

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

  const jobFunction = async (job) => {
    if (!assessment_question.max_manual_points) {
      job.fail('The assessment question has no manual grading');
    }
    const all_instance_questions = await selectInstanceQuestionsForAssessmentQuestion(
      assessment_question.id,
    );

    job.info('Checking for embeddings for all submissions.');
    const newEmbeddingsCount = 0;

    // NOTE: This breaks MCQ autograding
    // - Generate embeddings for each instance question
    // - Cluster them into k=20 clusters
    job.info('Generate embeddings to find the reference submissions.');

    const representedClusters = new Set<number>();
    const representativeSamples: InstanceQuestion[] = [];
    const reference_submission_ids: string[] = [];
    const reference_instance_question_ids: string[] = [];

    const embeddings: number[][] = await async.mapLimit(all_instance_questions, 50, async (instance_question: InstanceQuestion) => {
      const { submission } = await selectLastVariantAndSubmission(instance_question.id); 

      await deleteEmbeddingForSubmission(submission.id);

      const { embedding } = await generateSubmissionEmbedding({
        course,
        question,
        submitted_answer: submission.submitted_answer,
        instance_question,
        urlPrefix,
        openai,
      });

      return embedding;
    });

    const kmeans = new Clusters.KMeans(20, 0.05);
    const result = kmeans.fitPredict(embeddings);

    for (let i = 0; i < result.length; i++) {
      const cluster = result[i];
      if (representedClusters.has(cluster)) {
        continue;
      }
      representativeSamples.push(all_instance_questions[i]);

      const {submission} = await selectLastVariantAndSubmission(all_instance_questions[i].id);

      reference_submission_ids.push(submission.id);
      reference_instance_question_ids.push(all_instance_questions[i].id);
      representedClusters.add(cluster);
    }
    // Generate rubric item aware embeddings for the representative samples.
    // This simulates an instructor grading the representative samples.
    job.info('Generate embeddings incorporating the rubric/human grading for the reference submissions.');
    console.log('Generate embeddings incorporating the rubric/human grading for the reference submissions.');

    await async.eachLimit(all_instance_questions, 50, async (instance_question: InstanceQuestion) => {
      const { submission } = await selectLastVariantAndSubmission(instance_question.id); 

      await deleteEmbeddingForSubmission(submission.id);

      if (!reference_submission_ids.includes(submission.id)) {
        return;
      }

      await generateSubmissionEmbedding({
        course,
        question,
        submitted_answer: submission.submitted_answer,
        instance_question,
        urlPrefix,
        openai,
        graderFeedbackAvailable: true
      });
    });

    job.info('Generated embeddings for the representative samples.');
    console.log('Generated embeddings for the representative samples.');


    
    // for (const instance_question of all_instance_questions) {
    //   // Only checking for instance questions that can be used as RAG data.
    //   // They should be graded last by a human.
    //   if (instance_question.requires_manual_grading || instance_question.is_ai_graded) {
    //     continue;
    //   }

    //   const {submission} = await selectLastVariantAndSubmission(instance_question.id); 

    //   const submission_embedding = await selectEmbeddingForSubmission(submission.id);
      
    //   if (!submission_embedding) {
    //     await generateSubmissionEmbedding({
    //       course,
    //       question,
    //       submitted_answer: submission.submitted_answer,
    //       instance_question,
    //       urlPrefix,
    //       openai,
    //     });
    //     newEmbeddingsCount++;
    //   }
    // }
    job.info(`Calculated ${newEmbeddingsCount} embeddings.`);

    const instance_questions = all_instance_questions.filter((instance_question) => {
      if (mode === 'human_graded') {
        // Things that have been graded by a human
        return (
          !instance_question.requires_manual_grading &&
          instance_question.status !== 'unanswered' &&
          !instance_question.is_ai_graded
        );
      } else if (mode === 'all') {
        // Everything
        return true;
      } else if (mode === 'selected') {
        // Things that have been selected by checkbox
        return instance_question_ids?.includes(instance_question.id);
      } else {
        assertNever(mode);
      }
    });
    job.info(`Found ${instance_questions.length} submissions to grade!`);
    job.info('Allowed samples for RAG: ' + reference_submission_ids.join(', '));

    console.log('Found ' + instance_questions.length + ' submissions to grade!');
    console.log('Allowed samples for RAG: ' + reference_submission_ids.join(', '));

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
      const { variant, submission } = await selectLastVariantAndSubmission(instance_question.id);

      const locals = {
        ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
        questionRenderContext: 'ai_grading',
      };
      // Get question html
      const questionModule = questionServers.getModule(question.type);
      const render_question_results = await questionModule.render(
        { question: true, submissions: false, answer: false },
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


      // TODO: Temporary change -- for testing purposes, we will always generate a new embedding. 

      const submission_embedding_original = await selectEmbeddingForSubmission(submission.id);
      if (submission_embedding_original) {
        // remove the existing embedding
        deleteEmbeddingForSubmission(submission.id);
      }

      const submission_embedding = await generateSubmissionEmbedding({
        course,
        question,
        questionPrompt,
        submitted_answer: submission.submitted_answer,
        instance_question,
        urlPrefix,
        openai,
      });
      const submission_text = submission_embedding.submission_text;
      const example_submissions = image_rag_enabled ? await selectClosestSubmissionInfo({
        submission_id: submission.id,
        assessment_question_id: assessment_question.id,
        embedding: submission_embedding.new_submission_embedding.embedding,
        limit: 5,
        submission_ids_allowed: reference_submission_ids.map(id => parseInt(id))
      }) : [];

      let gradedExampleInfo = `\nInstance question ${instance_question.id}${example_submissions.length ? '\nThe following instance questions were used as human-graded examples:' : ''}`;
      for (const example of example_submissions) {
        gradedExampleInfo += `\n- ${example.instance_question_id}`;
      }
      logger.info(gradedExampleInfo);

      const rubric_items = await selectRubricForGrading(assessment_question.id);

      const { messages } = await generatePrompt({
        questionPrompt,
        submission_text,
        submitted_answer: submission.submitted_answer,
        example_submissions,
        rubric_items,
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
        const RubricGradingResultSchema = z.object({
          rubric_items: RubricGradingItemsSchema,
          feedback: z.string(),
        });
        const completion = await openai.chat.completions.parse({
          messages,
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(RubricGradingResultSchema, 'score'),
          temperature: OPEN_AI_TEMPERATURE,
        });
        try {
          logger.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          logger.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          logger.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);

          const response = completion.choices[0].message;

          logger.info(`Raw response:\n${response.content}`);

          logger.info('Parsed content:');
          logger.info(JSON.stringify(response.parsed, null, 2));

          if (response.parsed) {
            const { appliedRubricItems, appliedRubricDescription } = parseAiRubricItems({
              ai_rubric_items: response.parsed.rubric_items,
              rubric_items,
            });

            logger.info('Feedback:' + response.parsed?.feedback);
            logger.info(
              'instance_question.requires_manual_grading: ' +
                instance_question.requires_manual_grading,
            );

            if (instance_question.requires_manual_grading) {
              logger.info('Manual grading required');
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
                    manual_rubric_data,
                    feedback: { manual: response.parsed?.feedback ?? '' },
                  },
                  user_id,
                  true, // is_ai_graded
                );
                assert(grading_job_id);

                await insertAiGradingJob({
                  grading_job_id,
                  job_sequence_id: serverJob.jobSequenceId,
                  prompt: messages,
                  completion,
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
                    feedback: { manual: response.parsed?.feedback ?? '' },
                  },
                  IdSchema,
                );

                await insertAiGradingJob({
                  grading_job_id,
                  job_sequence_id: serverJob.jobSequenceId,
                  prompt: messages,
                  completion,
                  course_id: course.id,
                  course_instance_id,
                });
              });
            }

            logger.info('AI rubric items:');

            for (const item of appliedRubricDescription) {
              logger.info(`- ${item}`);
            }
          } else if (response.refusal) {
            logger.error(`ERROR AI grading for ${instance_question.id}`);
            logger.error(response.refusal);

            return false;
          }
        } catch (err) {
          logger.error(`ERROR AI grading for ${instance_question.id}`);
          logger.error(err);
          return false;
        }
      } else {
        const completion = await openai.chat.completions.parse({
          messages,
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(GradingResultSchema, 'score'),
          temperature: OPEN_AI_TEMPERATURE,
        });
        try {
          logger.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          logger.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          logger.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);

          const response = completion.choices[0].message;
          logger.info(`Raw response:\n${response.content}`);

          if (response.parsed) {
            const score = response.parsed.score;

            if (instance_question.requires_manual_grading) {
              // Requires grading: update instance question score
              const feedback = response.parsed.feedback;
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
                  prompt: messages,
                  completion,
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
                    feedback: { manual: response.parsed?.feedback ?? '' },
                  },
                  IdSchema,
                );
                await insertAiGradingJob({
                  grading_job_id,
                  job_sequence_id: serverJob.jobSequenceId,
                  prompt: messages,
                  completion,
                  course_id: course.id,
                  course_instance_id,
                });
              });
            }

            logger.info(`AI score: ${response.parsed.score}`);
          } else if (response.refusal) {
            logger.error(`ERROR AI grading for ${instance_question.id}`);
            logger.error(response.refusal);

            return false;
          }
        } catch (err) {
          logger.error(`ERROR AI grading for ${instance_question.id}`);
          logger.error(err);
          return false;
        }
      }

      return true;
    };

    // Grade each instance question and return an array indicating the success/failure of each grading operation.
    job.info('Grading instance questions with AI...');
    job.info('reference_submission_ids: ' + reference_submission_ids.join(', '));
    job.info('instance_questions count (unfiltered): ' + instance_questions.length);

    job.info('instance_questions count: ' + instance_questions.filter(
      iq => !reference_instance_question_ids.includes(`${iq.id}`)
    ).length);

    console.log('Grading instance questions with AI...');

    const instance_question_grading_successes = await async.mapLimit(
      instance_questions.filter(
        iq => !reference_instance_question_ids.includes(`${iq.id}`)
      ),
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
            if (log.messageType === 'info') {
              job.info(log.message);
            } else if (log.messageType === 'error') {
              job.error(log.message);
            }
          }
        }
      },
    );

    const error_count = instance_question_grading_successes.filter((success) => !success).length;

    if (error_count > 0) {
      job.error('Number of errors: ' + error_count);
      job.fail('Errors occurred while AI grading, see output for details');
    }
  };

  if (run_async) {
    // Run the job asynchronously
    await serverJob.executeInBackground(jobFunction);
  } else {
    // Run the job synchronously
    await serverJob.execute(jobFunction);
  }

  return serverJob.jobSequenceId;
}
