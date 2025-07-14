import * as cheerio from 'cheerio';
import { type OpenAI } from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ParsedChatCompletion,
} from 'openai/resources/chat/completions.mjs';
import { z } from 'zod';

import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import {
  type Course,
  IdSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  type Question,
  type RubricItem,
  RubricItemSchema,
  type Submission,
  type SubmissionGradingContextEmbedding,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  type Variant,
  VariantSchema,
} from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import * as questionServers from '../../../question-servers/index.js';
import { createEmbedding, vectorToString } from '../contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.url);
export const OPEN_AI_MODEL: OpenAI.Chat.ChatModel = 'gpt-4o-2024-11-20';
export const OPEN_AI_TEMPERATURE = 0.2;

export const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});
export const GradingResultSchema = z.object({ score: z.number(), feedback: z.string() });
export const GradedExampleSchema = z.object({
  submission_text: z.string(),
  score_perc: z.number(),
  feedback: z.record(z.string(), z.any()).nullable(),
  instance_question_id: z.string(),
  manual_rubric_grading_id: z.string().nullable(),
});
export type GradedExample = z.infer<typeof GradedExampleSchema>;

export function calculateApiCost(usage?: OpenAI.Completions.CompletionUsage): number {
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

export async function generatePrompt({
  questionPrompt,
  submission_text,
  submitted_answer,
  example_submissions,
  rubric_items,
}: {
  questionPrompt: string;
  submission_text: string;
  submitted_answer: Record<string, any> | null;
  example_submissions: GradedExample[];
  rubric_items: RubricItem[];
}): Promise<{
  messages: ChatCompletionMessageParam[];
}> {
  const messages: ChatCompletionMessageParam[] = [];

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
      const rubric_grading_items = await selectRubricGradingItems(example.manual_rubric_grading_id);
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
  messages.push(
    generateSubmissionMessage({
      submission_text,
      submitted_answer,
    }),
  );

  return { messages };
}

/**
 * Parses the student's answer and the HTML of the student's submission to generate a message for the AI model.
 */
export function generateSubmissionMessage({
  submission_text,
  submitted_answer,
}: {
  submission_text: string;
  submitted_answer: Record<string, any> | null;
}): ChatCompletionMessageParam {
  const message_content: ChatCompletionContentPart[] = [];

  message_content.push({
    type: 'text',
    text: 'The student submitted the following response: \n<response>\n',
  });

  // Walk through the submitted HTML from top to bottom, appending alternating text and image segments
  // to the message content to construct an AI-readable version of the submission.

  const $submission_html = cheerio.load(submission_text);
  let submissionTextSegment = '';

  $submission_html
    .root()
    .find('body')
    .contents()
    .each((_, node) => {
      const imageCaptureUUID = $submission_html(node).data('image-capture-uuid');
      if (imageCaptureUUID) {
        if (submissionTextSegment) {
          // Push and reset the current text segment before adding the image.
          message_content.push({
            type: 'text',
            text: submissionTextSegment,
          });
          submissionTextSegment = '';
        }

        const options = $submission_html(node).data('options') as Record<string, string>;
        const submittedImageName = options.submitted_file_name;
        if (!submittedImageName) {
          // If no submitted filename is available, no image was captured.
          message_content.push({
            type: 'text',
            text: `Image capture with ${options.file_name} was not captured.`,
          });
          return;
        }

        // submitted_answer contains the base-64 encoded image data for the image capture.

        if (!submitted_answer) {
          throw new Error('No submitted answers found.');
        }

        if (!submitted_answer[submittedImageName]) {
          throw new Error(`Image name ${submittedImageName} not found in submitted answers.`);
        }

        message_content.push({
          type: 'image_url',
          image_url: {
            url: submitted_answer[submittedImageName],
          },
        });
      } else {
        submissionTextSegment += $submission_html(node).text();
      }
    });

  if (submissionTextSegment) {
    message_content.push({
      type: 'text',
      text: submissionTextSegment,
    });
  }

  message_content.push({
    type: 'text',
    text: '\n</response>\nHow would you grade this? Please return the JSON object.',
  });

  return {
    role: 'user',
    content: message_content,
  } satisfies ChatCompletionMessageParam;
}

export async function generateSubmissionEmbedding({
  course,
  question,
  questionPrompt,
  submitted_answer,
  instance_question,
  urlPrefix,
  openai,
}: {
  question: Question;
  course: Course;
  /** The rendered HTML content of the question. */
  questionPrompt?: string;
  submitted_answer: Record<string, any> | null;
  instance_question: InstanceQuestion;
  urlPrefix: string;
  openai: OpenAI;
}): Promise<SubmissionGradingContextEmbedding> {
  const question_course = await getQuestionCourse(question, course);
  const { variant, submission } = await selectLastVariantAndSubmission(instance_question.id);
  const locals = {
    ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
    questionRenderContext: 'ai_grading',
  };
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: true, answer: false },
    variant,
    question,
    submission,
    [submission],
    question_course,
    locals,
  );
  let submission_text = render_submission_results.data.submissionHtmls[0];

  let contains_image_capture = false;
  const $submission_html = cheerio.load(submission_text);

  $submission_html
    .root()
    .find('img[data-image-capture-uuid]')
    .contents()
    .each((_, node) => {
      if ($submission_html(node).data('image-capture-uuid')) {
        contains_image_capture = true;
      }
    });

  if (contains_image_capture) {
    // 1. Extract the text and images within the submission HTML. With this, create a prompt to ask the AI, 
    //    - Summarize the submission text and any images.
    //    - Explain the student's errors.
    //    - Explain the reasoning for selecting each rubric item
    // 2. Add this to the submission HTML, and add it to the prompt for embedding. 

    let messages: ChatCompletionMessageParam[] = [
      generateSubmissionMessage({
        submission_text,
        submitted_answer
      }),
      {
        role: 'user',
        content: 'Given the student\'s submission, perform the following tasks:\n' +
          '1. Extract the text of the student submission. For images, extract the text as closely as possible without attempting to correct it and describe any handwritten non-textual content, particularly information that would be relevant to the rubric/grading of the question. Place into the response_transcription field.\n' +
          '2. Explain the student\'s errors. Place into the errors field.\n' +
          '3. Explain the reasoning for selecting each rubric item. Place into the rubric_reasoning field.\n'
      }
    ];

    if (questionPrompt) {
      messages = [
        {
          role: 'user',
          content: `Question: \n${questionPrompt}`,
        },
        ...messages
      ];
    }

    const imageCaptureDescriptionResponses = z.object({
      response_transcription: z.string(),
      errors: z.string(),
      rubric_reasoning: z.string(),
    });

    const completion = await openai.chat.completions.create({
      messages,
      model: OPEN_AI_MODEL,
      user: `course_${course.id}`,
      temperature: OPEN_AI_TEMPERATURE
    });

    const response = imageCaptureDescriptionResponses.parse(completion.choices[0].message.content);

    // Add the extracted information to the submission HTML.
    submission_text = `
      ${response.response_transcription}
      ${response.errors}
      ${response.rubric_reasoning}
    `;
  }

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


export function parseAiRubricItems({
  ai_rubric_items,
  rubric_items,
}: {
  ai_rubric_items: Record<string, boolean>;
  rubric_items: RubricItem[];
}): {
  appliedRubricItems: {
    rubric_item_id: string;
  }[];
  appliedRubricDescription: Set<string>;
} {
  // Compute the set of selected rubric descriptions.
  const appliedRubricDescription = new Set<string>();
  Object.entries(ai_rubric_items).forEach(([description, selected]) => {
    if (selected) {
      appliedRubricDescription.add(description);
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
  const appliedRubricItems = Array.from(appliedRubricDescription).map((description) => ({
    rubric_item_id: rubricItemsByDescription[description].id,
  }));
  return { appliedRubricItems, appliedRubricDescription };
}

export async function selectInstanceQuestionsForAssessmentQuestion(
  assessment_question_id: string,
): Promise<InstanceQuestion[]> {
  return await queryRows(
    sql.select_instance_questions_for_assessment_question,
    {
      assessment_question_id,
    },
    InstanceQuestionSchema,
  );
}

export async function selectRubricGradingItems(
  manual_rubric_grading_id: string | null,
): Promise<RubricItem[]> {
  return await queryRows(
    sql.select_rubric_grading_items,
    {
      manual_rubric_grading_id,
    },
    RubricItemSchema,
  );
}

export async function insertAiGradingJob({
  grading_job_id,
  job_sequence_id,
  prompt,
  completion,
  course_id,
  course_instance_id,
}: {
  grading_job_id: string;
  job_sequence_id: string;
  prompt: ChatCompletionMessageParam[];
  completion: ParsedChatCompletion<any>;
  course_id: string;
  course_instance_id?: string;
}): Promise<void> {
  await queryAsync(sql.insert_ai_grading_job, {
    grading_job_id,
    job_sequence_id,
    prompt: JSON.stringify(prompt),
    completion,
    model: OPEN_AI_MODEL,
    prompt_tokens: completion.usage?.prompt_tokens ?? 0,
    completion_tokens: completion.usage?.completion_tokens ?? 0,
    cost: calculateApiCost(completion.usage),
    course_id,
    course_instance_id,
  });
}

export async function selectLastVariantAndSubmission(
  instance_question_id: string,
): Promise<{ variant: Variant; submission: Submission }> {
  return await queryRow(
    sql.select_last_variant_and_submission,
    { instance_question_id },
    SubmissionVariantSchema,
  );
}

export async function selectClosestSubmissionInfo({
  submission_id,
  assessment_question_id,
  embedding,
  limit,
  submission_ids_allowed = [],
}: {
  submission_id: string;
  assessment_question_id: string;
  embedding: string;
  limit: number;
  submission_ids_allowed?: number[]
}): Promise<GradedExample[]> {

  console.log('submission_ids_allowed', submission_ids_allowed);

  return await queryRows(
    sql.select_closest_submission_info,
    {
      submission_id,
      assessment_question_id,
      embedding,
      limit,
      submission_ids_allowed,
    },
    GradedExampleSchema,
  );
}

export async function selectRubricForGrading(
  assessment_question_id: string,
): Promise<RubricItem[]> {
  return await queryRows(
    sql.select_rubric_for_grading,
    {
      assessment_question_id,
    },
    RubricItemSchema,
  );
}

export async function selectLastSubmissionId(instance_question_id: string): Promise<string> {
  return await queryRow(sql.select_last_submission_id, { instance_question_id }, IdSchema);
}

export async function selectEmbeddingForSubmission(
  submission_id: string,
): Promise<SubmissionGradingContextEmbedding | null> {
  return await queryOptionalRow(
    sql.select_embedding_for_submission,
    { submission_id },
    SubmissionGradingContextEmbeddingSchema,
  );
}

export async function deleteEmbeddingForSubmission(
  submission_id: string,
): Promise<void> {
  await queryAsync(sql.delete_embedding_for_submission, { submission_id });
}