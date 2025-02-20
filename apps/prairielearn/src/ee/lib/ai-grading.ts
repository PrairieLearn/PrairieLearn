import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

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
const OPEN_AI_MODEL = 'gpt-4o-2024-08-06';

const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});
const GPTScoreSchema = z.object({ score: z.number(), feedback: z.string() });
const GradedExampleSchema = z.object({
  submission_text: z.string(),
  score_perc: z.number(),
  feedback: z.record(z.string(), z.any()).nullable(),
  instance_question_id: z.string(),
  manual_rubric_grading_id: z.string().nullable(),
});
type GradedExample = z.infer<typeof GradedExampleSchema>;

async function generateGPTPrompt({
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
  warning: string;
}> {
  const messages: {
    role: 'system' | 'user';
    content: string;
  }[] = [];
  let warning = '';

  // Instructions for grading
  if (rubric_items.length > 0) {
    let rubric_info = '';
    for (const item of rubric_items) {
      rubric_info += `number: ${item.number}\ndescription: ${item.description}\n`;
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
        'You are an instructor for a course, and you are grading assignments. You are provided several rubric items with the item number, item description, item explanation, and a grader note about the item. You must grade the assignment by using the rubric and returning an array of all rubric items, with an extra boolean parameter "selected" representing if the rubric item should be selected. You should always list all the rubric items, no matter if they are selected or not. You should also provide feedback on how to improve the answer by incorporating information from the rubric. I will provide some example answers and their corresponding scores.',
    });
    messages.push({
      role: 'system',
      content: `Here is the rubric info:\n${rubric_info}`,
    });
  } else {
    messages.push({
      role: 'system',
      content:
        'You are an instructor for a course, and you are grading assignments. You should always return the grade using a JSON object with two properties: score and feedback. The score should be an integer between 0 and 100. 0 being the lowest and 100 being the highest, and the feedback should be why you give this score, or how to improve the answer. You omit the feedback if the answer is correct. I will provide some example answers and their corresponding scores.',
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
      const rubric_grading_items = await queryRows(
        sql.select_rubric_grading_items,
        {
          manual_rubric_grading_id: example.manual_rubric_grading_id,
        },
        RubricItemSchema,
      );
      // Warning when graded rubric item does not match current rubric item
      if (
        rubric_grading_items.length > 0 &&
        rubric_grading_items[0].rubric_id !== rubric_items[0].rubric_id
      ) {
        warning += `Instance question ${example.instance_question_id}: example rubric id is different from the current rubric id.\n`;
      }
      let rubric_grading_info = '';
      for (const item of rubric_grading_items) {
        rubric_grading_info += `description: ${item.description}\n`;
      }
      messages.push({
        role: 'user',
        content: `Example answer: \n<answer>\n${example.submission_text} \n<answer>\nRubric items to this example answer: \n${rubric_grading_info}`,
      });
    } else {
      if (rubric_items.length > 0 && !example.manual_rubric_grading_id) {
        // Warning when example is not graded on the rubric but there is a rubric in use
        warning += `Instance question ${example.instance_question_id}: example is not graded on a rubric, but there is a rubric in use.\n`;
      } else if (rubric_items.length === 0 && example.manual_rubric_grading_id) {
        // Warning when example is graded on a rubric but there is no rubric in use
        warning += `Instance question ${example.instance_question_id}: example is graded on a rubric, but there is not a rubric in use.\n`;
      }
      messages.push({
        role: 'user',
        content:
          `Example answer: \n<answer>\n${example.submission_text} \n<answer>\nScore to this example answer: \n${example.score_perc}\n` +
          (example.feedback && example.feedback.manual
            ? `Feedback to this example answer: \n${example.feedback.manual}\n`
            : ''),
      });
    }
  }

  // Student answer
  messages.push({
    role: 'user',
    content: `The student submitted the following answer: \n<answer>\n${submission_text} \n<answer>\nHow would you grade this? Please return the JSON object.`,
  });

  if (warning) {
    warning = `Warning:\n${warning}Warning: accuracy may be lower due to inconsistent rubrics.`;
  }
  return { messages, warning };
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

function assertRubricNotModified(
  old_rubric_items: RubricItem[],
  new_rubric_items: RubricItem[],
): void {
  if (old_rubric_items.length !== new_rubric_items.length) {
    throw new Error('rubric modified between rubric retrieval and score insertion');
  }
  for (let i = 0; i < old_rubric_items.length; i++) {
    const old_item = old_rubric_items[i];
    const new_item = new_rubric_items[i];
    if (
      old_item.description !== new_item.description ||
      old_item.explanation !== new_item.explanation
    ) {
      throw new Error('rubric modified between rubric retrieval and score insertion');
    }
  }
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
    let rubric_items = await queryRows(
      sql.select_rubric_for_grading,
      {
        assessment_question_id: assessment_question.id,
      },
      RubricItemSchema,
    );
    let new_rubric_items = rubric_items;

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

      // Get question html
      const questionModule = questionServers.getModule(question.type);
      const render_question_results = await questionModule.render(
        { question: true, submissions: false, answer: false },
        variant,
        question,
        null,
        [],
        question_course,
        urls, // https://github.com/PrairieLearn/PrairieLearn/blob/623bba7567903457d2f513800cb9e19b92267fda/apps/prairielearn/src/question-servers/freeform.js#L1163
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

      const { messages, warning } = await generateGPTPrompt({
        questionPrompt,
        submission_text,
        example_submissions,
        rubric_items,
      });

      if (rubric_items.length > 0) {
        // Dynamically generate the rubric schema based on the number of items
        let GPTRubricItemSchema = z.object({});
        for (let i = 0; i < rubric_items.length; i++) {
          GPTRubricItemSchema = GPTRubricItemSchema.merge(
            z.object({
              [i]: z.object({ description: z.string(), selected: z.boolean() }),
            }),
          );
        }
        const GPTRubricScoreSchema = z.object({
          rubric_items: GPTRubricItemSchema,
          feedback: z.string(),
        });
        const completion = await openai.beta.chat.completions.parse({
          messages,
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(GPTRubricScoreSchema, 'score'),
        });
        try {
          job.info(`Number of tokens used: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw ChatGPT response:\n${response.content}`);
          if (response.parsed) {
            // Only care about the rubric numbers
            const gptRubricItems: number[] = [];
            for (let i = 0; i < rubric_items.length; i++) {
              const item = response.parsed.rubric_items[i];
              if (item.selected) {
                gptRubricItems.push(i);
              }
            }
            const manual_rubric_data = {
              rubric_id: rubric_items[0].rubric_id,
              applied_rubric_items: gptRubricItems.map((rubric_item_number) => ({
                rubric_item_id: rubric_items[rubric_item_number].id,
              })),
            };
            new_rubric_items = await queryRows(
              sql.select_rubric_for_grading,
              {
                assessment_question_id: assessment_question.id,
              },
              RubricItemSchema,
            );
            // Check if rubric items has been modified
            assertRubricNotModified(rubric_items, new_rubric_items);
            await manualGrading.updateInstanceQuestionScore(
              assessment_question.assessment_id,
              instance_question.id,
              submission.id,
              null, // modified_at
              {
                // feedback: { manual: response.parsed.feedback },
                manual_rubric_data,
              },
              user_id,
            );
            job.info(`AI rubric items: ${gptRubricItems.toString()}`);
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
        if (warning) {
          job.warn(warning);
        }
        rubric_items = new_rubric_items;
      } else {
        const completion = await openai.beta.chat.completions.parse({
          messages,
          model: OPEN_AI_MODEL,
          user: `course_${course.id}`,
          response_format: zodResponseFormat(GPTScoreSchema, 'score'),
        });
        try {
          job.info(`Number of tokens used: ${completion.usage?.total_tokens ?? 0}`);
          const response = completion.choices[0].message;
          job.info(`Raw ChatGPT response:\n${response.content}`);
          if (response.parsed) {
            await manualGrading.updateInstanceQuestionScore(
              assessment_question.assessment_id,
              instance_question.id,
              submission.id,
              null, // modified_at
              {
                score_perc: response.parsed.score,
                feedback: { manual: response.parsed.feedback },
              },
              user_id,
            );
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
        if (warning) {
          job.warn(warning);
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
