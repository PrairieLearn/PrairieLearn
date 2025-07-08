import assert from 'node:assert';

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
  generatePrompt,
  generateSubmissionEmbedding,
  insertAiGradingJob,
  parseAiRubricItems,
  selectEmbeddingForSubmission,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastSubmissionId,
  selectLastVariantAndSubmission,
  selectRubricForGrading
} from './ai-grading-util.js';

const sql = loadSqlEquiv(import.meta.url);

const PARALLEL_SUBMISSION_GRADING_LIMIT = 50;

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
  executeSync = false
}: {
  question: Question;
  course: Course;
  course_instance_id?: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
  mode: 'ungraded' | 'human_graded' | 'all' | 'selected';
  /**
   * Limit grading to the specified instance questions.
   * Only use when mode is 'selected'.
   */
  instance_question_ids?: string[];
  executeSync?: boolean;
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
          openai,
        });
        newEmbeddingsCount++;
      }
    }
    job.info(`Calculated ${newEmbeddingsCount} embeddings.`);

    const instance_questions = all_instance_questions.filter((instance_question) => {
      if (mode === 'human_graded') {
        // Things that have been graded by a human
        return (
          !instance_question.requires_manual_grading &&
          instance_question.status !== 'unanswered' &&
          !instance_question.is_ai_graded
        );
      } else if (mode === 'ungraded') {
        // Things that require grading
        return instance_question.requires_manual_grading;
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

    // Grade each instance question. The ith element of grading_successes contains whether or not grading the ith instance question succeeded.
    const grading_successes = await async.mapLimit(instance_questions, PARALLEL_SUBMISSION_GRADING_LIMIT, async (instance_question: InstanceQuestion) => {
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
        job.info(render_question_results.courseIssues.toString());
        job.error('Error occurred');
        job.fail('Errors occurred while AI grading, see output for details');
      }
      const questionPrompt = render_question_results.data.questionHtml;
  
      let submission_embedding = await selectEmbeddingForSubmission(submission.id);
      if (!submission_embedding) {
        submission_embedding = await generateSubmissionEmbedding({
          course,
          question,
          instance_question,
          urlPrefix,
          openai,
        });
      }
      const submission_text = submission_embedding.submission_text;

      // const example_submissions = await selectClosestSubmissionInfo({
      //   submission_id: submission.id,
      //   assessment_question_id: assessment_question.id,
      //   embedding: submission_embedding.embedding,
      //   limit: 5,
      // });
      // let gradedExampleInfo = `\nInstance question ${instance_question.id}${example_submissions.length ? '\nThe following instance questions were used as human-graded examples:' : ''}`;
      // for (const example of example_submissions) {
      //   gradedExampleInfo += `\n- ${example.instance_question_id}`;
      // }
      // job.info(gradedExampleInfo);

      const rubric_items = await selectRubricForGrading(assessment_question.id);
  
      const { messages } = await generatePrompt({
        questionPrompt,
        submission_text,
        submitted_answer: submission.submitted_answer,
        example_submissions: [],
        rubric_items,
      });
  
      if (rubric_items.length > 0) {
        // Dynamically generate the rubric schema based on the rubric items.
        let RubricGradingItemsSchema = z.object({}) as z.ZodObject<Record<string, z.ZodBoolean>>;
        for (const item of rubric_items) {
          RubricGradingItemsSchema = RubricGradingItemsSchema.merge(
            z.object({
              [item.description]: z.boolean(),
            })
          );
        }
        const RubricGradingResultSchema = z.object({
          rubric_items: RubricGradingItemsSchema,
          // The AI will explain why it selected the rubric items it did.
          feedback: z.string()
        });
        const completion = await openai.chat.completions.parse({
          messages,
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(RubricGradingResultSchema, 'score'),
          temperature: OPEN_AI_TEMPERATURE,
        });
        try {
          job.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          job.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          job.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw response:\n${response.content}`);
          if (response.parsed) {
            console.log('AI grading response:', response.parsed);
            const { appliedRubricItems, appliedRubricDescription } = parseAiRubricItems({
              ai_rubric_items: response.parsed.rubric_items,
              rubric_items,
            });
            if (instance_question.requires_manual_grading) {
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
                    feedback: { manual: response?.parsed?.feedback ?? '' },
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
                console.log('feedback', response?.parsed?.feedback);
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
                    feedback: { manual: response?.parsed?.feedback ?? ''},
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
  
            job.info('AI rubric items:');
            for (const item of appliedRubricDescription) {
              job.info(`- ${item}`);
            }
          } else if (response.refusal) {
            job.error(`ERROR AI grading for ${instance_question.id}`);
            job.error(response.refusal);
            return false;
          }
        } catch (err) {
          console.error(err);
          job.error(`ERROR AI grading for ${instance_question.id}`);
          job.error(err);
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
          job.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          job.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          job.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw response:\n${response.content}`);
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
                    feedback: null,
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
  
            job.info(`AI score: ${response.parsed.score}`);
          } else if (response.refusal) {
            job.error(`ERROR AI grading for ${instance_question.id}`);
            job.error(response.refusal);
            return false;
          }
        } catch (err) {
          job.error(`ERROR AI grading for ${instance_question.id}`);
          job.error(err);
          return false;
        }
      }
      return true;
    });

    const error_count = grading_successes.filter((success) => !success).length;

    if (error_count > 0) {
      job.error('Number of errors: ' + error_count);
      job.fail('Errors occurred while AI grading, see output for details');
    }
  };

  if (executeSync) {
    await serverJob.execute(jobFunction);
  } else {
    serverJob.executeInBackground(jobFunction);
  }

  return serverJob.jobSequenceId;
}
