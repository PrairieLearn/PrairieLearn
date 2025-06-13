import assert from 'node:assert';

import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { type AssessmentQuestion, type Course, type Question } from '../../lib/db-types.js';
import * as manualGrading from '../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../lib/question-render.js';
import { getQuestionCourse } from '../../lib/question-variant.js';
import { createServerJob } from '../../lib/server-jobs.js';
import * as questionServers from '../../question-servers/index.js';

import {
  GradingResultSchema,
  OPEN_AI_MODEL,
  OPEN_AI_TEMPERATURE,
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
} from './ai-grading/ai-grading-util.js';

export async function aiGrade({
  course,
  course_instance_id,
  question,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
  instance_question_ids,
}: {
  question: Question;
  course: Course;
  course_instance_id: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
  /**
   * Limit grading to the specified instance questions. Omit to grade only
   * the questions that are tagged as requiring manual grading.
   */
  instance_question_ids?: string[];
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
    description: 'Use LLM to grade assessment question',
  });

  serverJob.executeInBackground(async (job) => {
    const instance_questions = await selectInstanceQuestionsForAssessmentQuestion(
      assessment_question.id,
    );

    job.info('Checking for embeddings for all submissions.');
    let newEmbeddingsCount = 0;
    for (const instance_question of instance_questions) {
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

    let number_to_grade = 0;
    for (const instance_question of instance_questions) {
      if (instance_question.requires_manual_grading) {
        number_to_grade++;
      }
    }
    job.info(`Found ${number_to_grade} submissions to grade!`);

    let error_count = 0;

    // Grade each instance question
    for (const instance_question of instance_questions) {
      if (
        (instance_question_ids && !instance_question_ids.includes(instance_question.id)) || // Grade selected: skip non-selected
        (!instance_question_ids && !instance_question.requires_manual_grading) // Grade all: skip graded
      ) {
        continue;
      }
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

      const example_submissions = await selectClosestSubmissionInfo({
        submission_id: submission.id,
        assessment_question_id: assessment_question.id,
        embedding: submission_embedding.embedding,
        limit: 5,
      });
      let gradedExampleInfo = `\nInstance question ${instance_question.id}\nGraded examples:`;
      for (const example of example_submissions) {
        gradedExampleInfo += ` ${example.instance_question_id}`;
      }
      job.info(gradedExampleInfo);

      const rubric_items = await selectRubricForGrading(assessment_question.id);

      const { messages } = await generatePrompt({
        questionPrompt,
        submission_text,
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
            const { appliedRubricItems, appliedRubricDescription } = parseAiRubricItems({
              ai_rubric_items: response.parsed.rubric_items,
              rubric_items,
            });
            job.info('Selected rubric items:');
            for (const item of appliedRubricDescription) {
              job.info(`- ${item}`);
            }

            // Record the grading results.
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
                prompt: messages,
                completion,
                course_id: course.id,
                course_instance_id,
              });
            });
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
            const feedback = response.parsed.feedback;
            job.info(`AI score: ${score}`);

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
    }
  });

  return serverJob.jobSequenceId;
}
