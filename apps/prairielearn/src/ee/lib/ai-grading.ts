import assert from 'node:assert';

import * as cheerio from 'cheerio';
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

import { config } from '../../lib/config.js';
import {
  InstanceQuestionSchema,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  VariantSchema,
  type Course,
  type Question,
  type AssessmentQuestion,
  type SubmissionGradingContextEmbedding,
  IdSchema,
  RubricItemSchema,
  type RubricItem,
  type InstanceQuestion,
} from '../../lib/db-types.js';
import * as manualGrading from '../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../lib/question-render.js';
import { getQuestionCourse } from '../../lib/question-variant.js';
import { createServerJob } from '../../lib/server-jobs.js';
import * as questionServers from '../../question-servers/index.js';

import { createEmbedding, vectorToString } from './contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.url);
const OPEN_AI_MODEL: OpenAI.Chat.ChatModel = 'gpt-4o-2024-11-20';
const API_TEMPERATURE = 0.2;

const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});
const GradingResultSchema = z.object({ score: z.number(), feedback: z.string() });
const GradedExampleSchema = z.object({
  submission_text: z.string(),
  score_perc: z.number(),
  feedback: z.record(z.string(), z.any()).nullable(),
  instance_question_id: z.string(),
  manual_rubric_grading_id: z.string().nullable(),
});
type GradedExample = z.infer<typeof GradedExampleSchema>;

function calculateApiCost(usage?: OpenAI.Completions.CompletionUsage): number {
  if (!usage) {
    return 0;
  }
  const cached_input_tokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt_tokens = usage.prompt_tokens - cached_input_tokens;
  const completion_tokens = usage.completion_tokens;

  // Pricings are updated according to https://platform.openai.com/docs/pricing
  const cached_input_cost = 1.25 / 10 ** 6;
  const prompt_cost = 2.5 / 10 ** 6;
  const completion_cost = 10.0 / 10 ** 6;

  return (
    cached_input_tokens * cached_input_cost +
    prompt_tokens * prompt_cost +
    completion_tokens * completion_cost
  );
}

async function generatePrompt({
  questionPrompt,
  submission_text,
  example_submissions,
  rubric_items,
}: {
  questionPrompt: string;
  submission_text: string;
  example_submissions: GradedExample[];
  rubric_items: RubricItem[];
}): Promise<{
  messages: {
    role: 'system' | 'user';
    content: string;
  }[];
}> {
  const messages: {
    role: 'system' | 'user';
    content: string;
  }[] = [];

  // Instructions for grading
  if (rubric_items.length > 0) {
    let rubric_info = '';
    for (const item of rubric_items) {
      rubric_info += `description: ${item.description}\n`;
      if (item.explanation) {
        rubric_info += `explanation: ${item.explanation}\n`;
      }
      if (item.grader_note) {
        rubric_info += `grader note: ${item.grader_note}\n`;
      }
      rubric_info += '\n';
    }
    messages.push({
      role: 'system',
      content:
        "You are an instructor for a course, and you are grading a student's response to a question. You are provided several rubric items with a description, explanation, and grader note. You must grade the student's response by using the rubric and returning an object of rubric descriptions and whether or not that rubric item applies to the student's response. If no rubric items apply, do not select any." +
        (example_submissions.length
          ? ' I will provide some example student responses and their corresponding selected rubric items.'
          : ''),
    });
    messages.push({
      role: 'system',
      content: `Here are the rubric items:\n\n${rubric_info}`,
    });
  } else {
    messages.push({
      role: 'system',
      content:
        "You are an instructor for a course, and you are grading a student's response to a question. You should always return the grade using a JSON object with two properties: score and feedback. The score should be an integer between 0 and 100, with 0 being the lowest and 100 being the highest. The feedback should explain why you give this score. Follow any special instructions given by the instructor in the question. Omit the feedback if the student's response is correct." +
        (example_submissions.length
          ? ' I will provide some example student responses and their corresponding scores and feedback.'
          : ''),
    });
  }

  // Question prompt
  messages.push({
    role: 'user',
    content: `Question: \n${questionPrompt}`,
  });

  // Examples
  for (const example of example_submissions) {
    if (rubric_items.length > 0 && example.manual_rubric_grading_id) {
      // Note that the example may have been graded with a different rubric,
      // or the rubric may have changed significantly since the example was graded.
      // We'll show whatever items were selected anyways, since it'll likely
      // still be useful context to the LLM.
      const rubric_grading_items = await queryRows(
        sql.select_rubric_grading_items,
        {
          manual_rubric_grading_id: example.manual_rubric_grading_id,
        },
        RubricItemSchema,
      );
      let rubric_grading_info = '';
      for (const item of rubric_grading_items) {
        rubric_grading_info += `description: ${item.description}\n`;
      }
      messages.push({
        role: 'user',
        content: `Example student response: \n<response>\n${example.submission_text} \n<response>\nSelected rubric items for this example student response: \n${rubric_grading_info}`,
      });
    } else {
      messages.push({
        role: 'user',
        content:
          `Example student response: \n<response>\n${example.submission_text} \n<response>\nScore for this example student response: \n${example.score_perc}\n` +
          (example.feedback?.manual
            ? `Feedback for this example student response: \n${example.feedback.manual}\n`
            : ''),
      });
    }
  }

  // Student response
  messages.push({
    role: 'user',
    content: `The student submitted the following response: \n<response>\n${submission_text} \n<response>\nHow would you grade this? Please return the JSON object.`,
  });

  return { messages };
}

async function generateSubmissionEmbedding({
  course,
  question,
  instance_question,
  urlPrefix,
  openai,
}: {
  question: Question;
  course: Course;
  instance_question: InstanceQuestion;
  urlPrefix: string;
  openai: OpenAI;
}): Promise<SubmissionGradingContextEmbedding> {
  const question_course = await getQuestionCourse(question, course);
  const { variant, submission } = await queryRow(
    sql.select_last_variant_and_submission,
    { instance_question_id: instance_question.id },
    SubmissionVariantSchema,
  );
  const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: true, answer: false },
    variant,
    question,
    submission,
    [submission],
    question_course,
    // We deliberately do not set `manualGradingInterface: true` when rendering
    // the submission. The expectation is that instructors will use elements lik
    // `<pl-manual-grading-only>` to provide extra instructions to the LLM. We
    // don't want to mix in instructions like that with the student's response.
    urls,
  );
  const $ = cheerio.load(render_submission_results.data.submissionHtmls[0], null, false);
  $('script').remove();
  const submission_text = $.html();
  const embedding = await createEmbedding(openai, submission_text, `course_${course.id}`);
  // Insert new embedding into the table and return the new embedding
  const new_submission_embedding = await queryRow(
    sql.create_embedding_for_submission,
    {
      embedding: vectorToString(embedding),
      submission_id: submission.id,
      submission_text,
      assessment_question_id: instance_question.assessment_question_id,
    },
    SubmissionGradingContextEmbeddingSchema,
  );
  return new_submission_embedding;
}

function parseAiRubricItems({
  ai_rubric_items,
  rubric_items,
}: {
  ai_rubric_items: Record<string, boolean>;
  rubric_items: RubricItem[];
}): {
  appliedRubricItems: {
    rubric_item_id: string;
  }[];
  selectedRubricDescriptions: Set<string>;
} {
  // Compute the set of selected rubric descriptions.
  const selectedRubricDescriptions = new Set<string>();
  Object.entries(ai_rubric_items).forEach(([description, selected]) => {
    if (selected) {
      selectedRubricDescriptions.add(description);
    }
  });

  // Build a lookup table for rubric items by description.
  const rubricItemsByDescription: Record<string, RubricItem> = {};
  for (const item of rubric_items) {
    rubricItemsByDescription[item.description] = item;
  }

  // It's possible that the rubric could have changed since we last
  // fetched it. We'll optimistically apply all the rubric items
  // that were selected. If an item was deleted, we'll allow the
  // grading to fail; the user can then try again.
  const appliedRubricItems = Array.from(selectedRubricDescriptions).map((description) => ({
    rubric_item_id: rubricItemsByDescription[description].id,
  }));
  return { appliedRubricItems, selectedRubricDescriptions };
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length === 0) {
    throw new Error('Both arrays must have the same nonzero length.');
  }

  const n = x.length;
  const sumX = x.reduce((acc, val) => acc + val, 0);
  const sumY = y.reduce((acc, val) => acc + val, 0);
  const sumXY = x.reduce((acc, _, i) => acc + x[i] * y[i], 0);
  const sumX2 = x.reduce((acc, val) => acc + val * val, 0);
  const sumY2 = y.reduce((acc, val) => acc + val * val, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));

  return denominator === 0 ? null : numerator / denominator;
}

function rootMeanSquaredError(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length || actual.length === 0) {
    throw new Error('Both arrays must have the same nonzero length.');
  }

  const n = actual.length;
  const squaredErrors = actual.map((a, i) => (a - predicted[i]) ** 2);
  const meanSquaredError = squaredErrors.reduce((acc, val) => acc + val, 0) / n;

  return Math.sqrt(meanSquaredError);
}

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

    let number_to_test = 0;
    for (const instance_question of instance_questions) {
      if (!instance_question.requires_manual_grading && instance_question.status !== 'unanswered') {
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
      instance_question_id: string;
      reference_items: Set<string>;
      ai_items: Set<string>;
    }[] = [];
    const testScoreResults: {
      instance_question_id: string;
      reference_score: number;
      ai_score: number;
    }[] = [];

    // Test each instance question
    for (const instance_question of instance_questions) {
      if (instance_question.requires_manual_grading || instance_question.status === 'unanswered') {
        continue; // TODO: Add filter on human-graded submissions only after merging PR#11383
      }

      job.info(`\nInstance question ${instance_question.id}`);

      const { variant, submission } = await queryRow(
        sql.select_last_variant_and_submission,
        { instance_question_id: instance_question.id },
        SubmissionVariantSchema,
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

      const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
      const locals = { ...urls, manualGradingInterface: true };
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
      const $ = cheerio.load(render_question_results.data.questionHtml, null, false);
      $('script').remove();
      const questionPrompt = $.html();

      let submission_embedding = await queryOptionalRow(
        sql.select_embedding_for_submission,
        { submission_id: submission.id },
        SubmissionGradingContextEmbeddingSchema,
      );
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

      const example_submissions = await queryRows(
        sql.select_closest_submission_info,
        {
          submission_id: submission.id,
          assessment_question_id: assessment_question.id,
          embedding: submission_embedding.embedding,
          limit: 5,
        },
        GradedExampleSchema,
      );

      const { messages } = await generatePrompt({
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
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(RubricGradingResultSchema, 'score'),
          temperature: API_TEMPERATURE,
        });
        try {
          job.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          job.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          job.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw response:\n${response.content}`);

          if (response.parsed) {
            const { appliedRubricItems, selectedRubricDescriptions } = parseAiRubricItems({
              ai_rubric_items: response.parsed.rubric_items,
              rubric_items,
            });
            testRubricResults.push({
              instance_question_id: instance_question.id,
              reference_items: referenceRubricDescriptions,
              ai_items: selectedRubricDescriptions,
            });

            await runInTransactionAsync(async () => {
              const manual_rubric_grading = await manualGrading.insertRubricGrading(
                rubric_id,
                assessment_question.max_points ?? 0,
                assessment_question.max_manual_points ?? 0,
                appliedRubricItems,
                0,
              );
              assert(assessment_question.max_manual_points);
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
                model: OPEN_AI_MODEL,
                prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                completion_tokens: completion.usage?.completion_tokens ?? 0,
                cost: calculateApiCost(completion.usage),
                course_id: course.id,
                course_instance_id,
              });
            });

            job.info('Reference rubric items:');
            for (const item of referenceRubricDescriptions) {
              job.info(`- ${item}`);
            }
            job.info('AI rubric items:');
            for (const item of selectedRubricDescriptions) {
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
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(GradingResultSchema, 'score'),
          temperature: API_TEMPERATURE,
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
              instance_question_id: instance_question.id,
              reference_score: score_perc,
              ai_score: score,
            });

            // TODO: Insert grading job
            // TODO: Insert AI grading job after merging PR#11431
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
                model: OPEN_AI_MODEL,
                prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                completion_tokens: completion.usage?.completion_tokens ?? 0,
                cost: calculateApiCost(completion.usage),
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
        const rubricItemResults: Record<string, number> = {};
        rubric_items.forEach((item) => {
          rubricItemResults[item.description] = 0;
          testRubricResults.forEach((test) => {
            if (
              (test.ai_items.has(item.description) && test.reference_items.has(item.description)) ||
              (!test.ai_items.has(item.description) && !test.reference_items.has(item.description))
            ) {
              rubricItemResults[item.description]++;
            }
          });
          const accuracy =
            Math.round((10000 * rubricItemResults[item.description]) / testRubricResults.length) /
            100;
          job.info(`Rubric item: ${item.description}, accuracy: ${accuracy}%`);
        });
      } else {
        job.info(`Test size: ${testScoreResults.length}`);
        const rmse = rootMeanSquaredError(
          testScoreResults.map((item) => item.reference_score),
          testScoreResults.map((item) => item.ai_score),
        );
        job.info(`RMSE: ${Math.round(rmse * 100) / 100}`);
        const r = pearsonCorrelation(
          testScoreResults.map((item) => item.reference_score),
          testScoreResults.map((item) => item.ai_score),
        );
        job.info(`Pearson's r: ${r ? Math.round(r * 10000) / 10000 : 'N/A'}`);
      }
    }
  });
  return serverJob.jobSequenceId;
}

export async function aiGrade({
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
  course_instance_id: string;
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
    type: 'ai_grading',
    description: 'Use LLM to grade assessment question',
  });

  serverJob.executeInBackground(async (job) => {
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
      if (!instance_question.requires_manual_grading) {
        continue;
      }
      const { variant, submission } = await queryRow(
        sql.select_last_variant_and_submission,
        { instance_question_id: instance_question.id },
        SubmissionVariantSchema,
      );

      const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
      const locals = { ...urls, manualGradingInterface: true };
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
      const $ = cheerio.load(render_question_results.data.questionHtml, null, false);
      $('script').remove();
      const questionPrompt = $.html();

      let submission_embedding = await queryOptionalRow(
        sql.select_embedding_for_submission,
        { submission_id: submission.id },
        SubmissionGradingContextEmbeddingSchema,
      );
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

      const example_submissions = await queryRows(
        sql.select_closest_submission_info,
        {
          submission_id: submission.id,
          assessment_question_id: assessment_question.id,
          embedding: submission_embedding.embedding,
          limit: 5,
        },
        GradedExampleSchema,
      );
      let gradedExampleInfo = `\nInstance question ${instance_question.id}\nGraded examples:`;
      for (const example of example_submissions) {
        gradedExampleInfo += ` ${example.instance_question_id}`;
      }
      job.info(gradedExampleInfo);

      const rubric_items = await queryRows(
        sql.select_rubric_for_grading,
        {
          assessment_question_id: assessment_question.id,
        },
        RubricItemSchema,
      );

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
        const completion = await openai.beta.chat.completions.parse({
          messages,
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(RubricGradingResultSchema, 'score'),
          temperature: API_TEMPERATURE,
        });
        try {
          job.info(`Tokens used for prompt: ${completion.usage?.prompt_tokens ?? 0}`);
          job.info(`Tokens used for completion: ${completion.usage?.completion_tokens ?? 0}`);
          job.info(`Tokens used in total: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw response:\n${response.content}`);

          if (response.parsed) {
            const { appliedRubricItems, selectedRubricDescriptions } = parseAiRubricItems({
              ai_rubric_items: response.parsed.rubric_items,
              rubric_items,
            });
            job.info('Selected rubric items:');
            for (const item of selectedRubricDescriptions) {
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

              await queryAsync(sql.insert_ai_grading_job, {
                grading_job_id,
                job_sequence_id: serverJob.jobSequenceId,
                prompt: messages,
                completion,
                model: OPEN_AI_MODEL,
                prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                completion_tokens: completion.usage?.completion_tokens ?? 0,
                cost: calculateApiCost(completion.usage),
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
        const completion = await openai.beta.chat.completions.parse({
          messages,
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(GradingResultSchema, 'score'),
          temperature: API_TEMPERATURE,
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

              await queryAsync(sql.insert_ai_grading_job, {
                grading_job_id,
                job_sequence_id: serverJob.jobSequenceId,
                prompt: messages,
                completion,
                model: OPEN_AI_MODEL,
                prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                completion_tokens: completion.usage?.completion_tokens ?? 0,
                cost: calculateApiCost(completion.usage),
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
