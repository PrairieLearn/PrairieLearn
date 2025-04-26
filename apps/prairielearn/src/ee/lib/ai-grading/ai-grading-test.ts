import assert from 'node:assert';

import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import {
  type AssessmentQuestion,
  type Course,
  IdSchema,
  InstanceQuestionSchema,
  type Question,
  RubricItemSchema,
  SubmissionGradingContextEmbeddingSchema,
} from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import * as questionServers from '../../../question-servers/index.js';

import * as aiGradingUtil from './ai-grading-util.js';

const sql = loadSqlEquiv(import.meta.url);

export async function aiGradeTest({
  course,
  course_instance_id,
  question,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
}: {
  question: Question;
  course: Course;
  course_instance_id?: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
}): Promise<string> {
  // If OpenAI API Key and Organization are not provided, throw error
  if (!config.openAiApiKey || !config.openAiOrganization) {
    throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
  }
  const openai = new OpenAI({
    apiKey: config.openAiApiKey,
    organization: config.openAiOrganization,
  });

  const question_course = await getQuestionCourse(question, course);

  const serverJob = await createServerJob({
    courseId: course.id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_question.assessment_id,
    authnUserId: authn_user_id,
    userId: user_id,
    type: 'ai_grading_test',
    description: 'Test accuracy for AI grading',
  });

  serverJob.executeInBackground(async (job) => {
    if (!assessment_question.max_manual_points) {
      job.fail('The tested question has no manual grading');
    }

    const instance_questions = await queryRows(
      sql.select_instance_questions_for_assessment_question,
      {
        assessment_question_id: assessment_question.id,
      },
      InstanceQuestionSchema,
    );

    job.info('Checking for embeddings for all submissions.');
    let newEmbeddingsCount = 0;
    for (const instance_question of instance_questions) {
      const submission_id = await queryRow(
        sql.select_last_submission_id,
        { instance_question_id: instance_question.id },
        IdSchema,
      );
      const submission_embedding = await queryOptionalRow(
        sql.select_embedding_for_submission,
        { submission_id },
        SubmissionGradingContextEmbeddingSchema,
      );
      if (!submission_embedding) {
        await aiGradingUtil.generateSubmissionEmbedding({
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

    let number_to_test = 0;
    for (const instance_question of instance_questions) {
      if (
        !instance_question.requires_manual_grading &&
        instance_question.status !== 'unanswered' &&
        !instance_question.is_ai_graded
      ) {
        number_to_test++;
      }
    }
    job.info(`Found ${number_to_test} submissions to test!`);

    const rubric_items = await queryRows(
      sql.select_rubric_for_grading,
      {
        assessment_question_id: assessment_question.id,
      },
      RubricItemSchema,
    );
    const rubric_id = rubric_items.length ? rubric_items[0].rubric_id : null;

    let error_count = 0;
    const testRubricResults: {
      reference_items: Set<string>;
      ai_items: Set<string>;
    }[] = [];
    const testScoreResults: {
      reference_score: number;
      ai_score: number;
    }[] = [];

    // Test each instance question
    for (const instance_question of instance_questions) {
      if (
        instance_question.status === 'unanswered' ||
        instance_question.requires_manual_grading ||
        instance_question.is_ai_graded
      ) {
        // Only test on instance questions that have been submitted and graded by a human
        continue;
      }

      job.info(`\nInstance question ${instance_question.id}`);

      const { variant, submission } = await queryRow(
        sql.select_last_variant_and_submission,
        { instance_question_id: instance_question.id },
        aiGradingUtil.SubmissionVariantSchema,
      );

      const grading_rubric_id = await queryOptionalRow(
        sql.select_rubric_id_from_grading,
        { manual_rubric_grading_id: submission.manual_rubric_grading_id },
        IdSchema,
      );

      if (rubric_id !== grading_rubric_id) {
        job.info(
          'Rubric used for this submission does not match the current rubric in use. Skipping test.',
        );
        continue;
      }

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

      let submission_embedding = await queryOptionalRow(
        sql.select_embedding_for_submission,
        { submission_id: submission.id },
        SubmissionGradingContextEmbeddingSchema,
      );
      if (!submission_embedding) {
        submission_embedding = await aiGradingUtil.generateSubmissionEmbedding({
          course,
          question,
          instance_question,
          urlPrefix,
          openai,
        });
      }
      const submission_text = submission_embedding.submission_text;

      const example_submissions = await queryRows(
        sql.select_closest_submission_info,
        {
          submission_id: submission.id,
          assessment_question_id: assessment_question.id,
          embedding: submission_embedding.embedding,
          limit: 5,
        },
        aiGradingUtil.GradedExampleSchema,
      );

      const { messages } = await aiGradingUtil.generatePrompt({
        questionPrompt,
        submission_text,
        example_submissions,
        rubric_items,
      });

      if (rubric_id) {
        const rubric_grading_items = await queryRows(
          sql.select_rubric_grading_items,
          { manual_rubric_grading_id: submission.manual_rubric_grading_id },
          RubricItemSchema,
        );
        const referenceRubricDescriptions = new Set<string>();
        rubric_grading_items.forEach((item) => {
          referenceRubricDescriptions.add(item.description);
        });

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
        });
        const completion = await openai.beta.chat.completions.parse({
          messages,
          model: aiGradingUtil.OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(RubricGradingResultSchema, 'score'),
          temperature: aiGradingUtil.API_TEMPERATURE,
        });
        try {
          job.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          job.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          job.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw response:\n${response.content}`);

          if (response.parsed) {
            const { appliedRubricItems, appliedRubricDescription } =
              aiGradingUtil.parseAiRubricItems({
                ai_rubric_items: response.parsed.rubric_items,
                rubric_items,
              });
            testRubricResults.push({
              reference_items: referenceRubricDescriptions,
              ai_items: appliedRubricDescription,
            });

            await runInTransactionAsync(async () => {
              assert(assessment_question.max_manual_points);
              const manual_rubric_grading = await manualGrading.insertRubricGrading(
                rubric_id,
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
              await queryAsync(sql.insert_ai_grading_job, {
                grading_job_id,
                job_sequence_id: serverJob.jobSequenceId,
                prompt: messages,
                completion,
                model: aiGradingUtil.OPEN_AI_MODEL,
                prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                completion_tokens: completion.usage?.completion_tokens ?? 0,
                cost: aiGradingUtil.calculateApiCost(completion.usage),
                course_id: course.id,
                course_instance_id,
              });
            });

            job.info('Reference rubric items:');
            for (const item of referenceRubricDescriptions) {
              job.info(`- ${item}`);
            }
            job.info('AI rubric items:');
            for (const item of appliedRubricDescription) {
              job.info(`- ${item}`);
            }
          } else if (response.refusal) {
            job.error(`ERROR AI grading for ${instance_question.id}`);
            job.error(response.refusal);
            error_count++;
          }
        } catch (err) {
          job.error(`ERROR AI grading for ${instance_question.id}`);
          job.error(err);
          error_count++;
        }
      } else {
        const score_perc = instance_question.score_perc ?? 0;
        const completion = await openai.beta.chat.completions.parse({
          messages,
          model: aiGradingUtil.OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(aiGradingUtil.GradingResultSchema, 'score'),
          temperature: aiGradingUtil.API_TEMPERATURE,
        });
        try {
          job.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          job.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          job.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw response:\n${response.content}`);
          if (response.parsed) {
            const score = response.parsed.score;
            testScoreResults.push({
              reference_score: score_perc,
              ai_score: score,
            });

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
              await queryAsync(sql.insert_ai_grading_job, {
                grading_job_id,
                job_sequence_id: serverJob.jobSequenceId,
                prompt: messages,
                completion,
                model: aiGradingUtil.OPEN_AI_MODEL,
                prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                completion_tokens: completion.usage?.completion_tokens ?? 0,
                cost: aiGradingUtil.calculateApiCost(completion.usage),
                course_id: course.id,
                course_instance_id,
              });
            });

            job.info(`Reference score: ${score_perc}`);
            job.info(`AI score: ${response.parsed.score}`);
          } else if (response.refusal) {
            job.error(`ERROR AI grading for ${instance_question.id}`);
            job.error(response.refusal);
            error_count++;
          }
        } catch (err) {
          job.error(`ERROR AI grading for ${instance_question.id}`);
          job.error(err);
          error_count++;
        }
      }
    }

    if (error_count > 0) {
      job.error('Number of errors: ' + error_count);
      job.fail('Errors occurred while AI grading, see output for details');
    } else {
      job.info('\n----------------Test results----------------');
      if (rubric_id) {
        job.info(`Test size: ${testRubricResults.length}`);
        rubric_items.forEach((item) => {
          const accuracy = aiGradingUtil.rubricItemAccuracy(testRubricResults, item);
          job.info(`Rubric item: ${item.description}, accuracy: ${accuracy}%`);
        });
      } else {
        job.info(`Test size: ${testScoreResults.length}`);
        const rmse = aiGradingUtil.rootMeanSquaredError(
          testScoreResults.map((item) => item.reference_score),
          testScoreResults.map((item) => item.ai_score),
        );
        job.info(`RMSE: ${rmse}`);
        const r = aiGradingUtil.pearsonCorrelation(
          testScoreResults.map((item) => item.reference_score),
          testScoreResults.map((item) => item.ai_score),
        );
        job.info(`Pearson's r: ${r}`);
      }
    }
  });
  return serverJob.jobSequenceId;
}
