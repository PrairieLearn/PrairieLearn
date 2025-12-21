import {
  generateObject,
  type EmbeddingModel,
  type GenerateObjectResult,
  type GenerateTextResult,
  type LanguageModel,
  type ModelMessage,
  type UserContent,
} from 'ai';
import * as cheerio from 'cheerio';
import { z } from 'zod';

import {
  callRow,
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { calculateResponseCost, formatPrompt } from '../../../lib/ai.js';
import {
  AssessmentQuestionSchema,
  type Course,
  GradingJobSchema,
  IdSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  type Question,
  type RubricItem,
  RubricItemSchema,
  SprocAssessmentInstancesGradeSchema,
  type Submission,
  type SubmissionGradingContextEmbedding,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  type Variant,
  VariantSchema,
} from '../../../lib/db-types.js';
import * as ltiOutcomes from '../../../lib/ltiOutcomes.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import * as questionServers from '../../../question-servers/index.js';
import { createEmbedding, vectorToString } from '../contextEmbeddings.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';
import sharp from 'sharp';

const sql = loadSqlEquiv(import.meta.url);

export const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});
export const GradedExampleSchema = z.object({
  submission_text: z.string(),
  score_perc: z.number(),
  feedback: z.record(z.string(), z.any()).nullable(),
  instance_question_id: z.string(),
  manual_rubric_grading_id: z.string().nullable(),
});
export type GradedExample = z.infer<typeof GradedExampleSchema>;

/**
 * Models supporting system messages after the first user message.
 * As of November 2025,
 * - OpenAI GPT 5-mini and GPT 5.1 support this.
 * - Google Gemini 2.5-flash and Gemini 3 Pro Preview do not support this.
 * - Anthropic Claude Haiku 4.5, Claude Sonnet 4.5, and Claude Opus 4.5 do not support this.
 */
const MODELS_SUPPORTING_SYSTEM_MSG_AFTER_USER_MSG = new Set<AiGradingModelId>([
  'gpt-5-mini-2025-08-07',
  'gpt-5.1-2025-11-13',
]);

export async function generatePrompt({
  questionPrompt,
  questionAnswer,
  submission_text,
  submitted_answer,
  example_submissions,
  rubric_items,
  model_id,
}: {
  questionPrompt: string;
  questionAnswer: string;
  submission_text: string;
  submitted_answer: Record<string, any> | null;
  example_submissions: GradedExample[];
  rubric_items: RubricItem[];
  model_id: AiGradingModelId;
}): Promise<{input: ModelMessage[], submissionImages: {[key: string]: string}}> {
  const input: ModelMessage[] = [];

  const systemRoleAfterUserMessage = MODELS_SUPPORTING_SYSTEM_MSG_AFTER_USER_MSG.has(model_id)
    ? 'system'
    : 'user';

  // Instructions for grading
  if (rubric_items.length > 0) {
    input.push(
      {
        role: 'system',
        content: formatPrompt([
          [
            "You are an instructor for a course, and you are grading a student's response to a question.",
            'You are provided several rubric items with a description, explanation, and grader note.',
            "You must grade the student's response by using the rubric and returning an object of rubric descriptions and whether or not that rubric item applies to the student's response.",
            'If no rubric items apply, do not select any.',
            'You must include an explanation on why you make these choices.',
            'Follow any special instructions given by the instructor in the question.',
          ],
          'Here are the rubric items:',
        ]),
      },
      {
        role: 'user',
        content: rubric_items
          .map((item) => {
            const itemParts: string[] = [`description: ${item.description}`];
            if (item.explanation) {
              itemParts.push(`explanation: ${item.explanation}`);
            }
            if (item.grader_note) {
              itemParts.push(`grader note: ${item.grader_note}`);
            }
            return itemParts.join('\n');
          })
          .join('\n\n'),
      },
    );
  } else {
    input.push({
      role: 'system',
      content: formatPrompt([
        "You are an instructor for a course, and you are grading a student's response to a question.",
        'You will assign a numeric score between 0 and 100 (inclusive) to the student response,',
        "Include feedback for the student, but omit the feedback if the student's response is entirely correct.",
        'You must include an explanation on why you made these choices.',
        'Follow any special instructions given by the instructor in the question.',
      ]),
    });
  }

  input.push(
    {
      role: systemRoleAfterUserMessage,
      content: 'This is the question for which you will be grading a response:',
    },
    {
      role: 'user',
      content: questionPrompt,
    },
  );

  if (questionAnswer.trim()) {
    input.push(
      {
        role: systemRoleAfterUserMessage,
        content: 'The instructor has provided the following answer for this question:',
      },
      {
        role: 'user',
        content: questionAnswer.trim(),
      },
    );
  }

  if (example_submissions.length > 0) {
    if (rubric_items.length > 0) {
      input.push({
        role: systemRoleAfterUserMessage,
        content:
          'Here are some example student responses and their corresponding selected rubric items.',
      });
    } else {
      input.push({
        role: systemRoleAfterUserMessage,
        content:
          'Here are some example student responses and their corresponding scores and feedback.',
      });
    }

    // Examples
    for (const example of example_submissions) {
      if (rubric_items.length > 0 && example.manual_rubric_grading_id) {
        // Note that the example may have been graded with a different rubric,
        // or the rubric may have changed significantly since the example was graded.
        // We'll show whatever items were selected anyways, since it'll likely
        // still be useful context to the LLM.
        const rubric_grading_items = await selectRubricGradingItems(
          example.manual_rubric_grading_id,
        );
        input.push({
          role: 'user',
          content: formatPrompt([
            '<example-submission>',
            example.submission_text,
            '</example-submission>',
            '<selected-rubric-items>',
            run(() => {
              if (rubric_grading_items.length === 0) {
                return 'No rubric items were selected for this example student response.';
              }
              return rubric_grading_items.map((item) => `- ${item.description}`).join('\n');
            }),
            '</selected-rubric-items>',
          ]),
        });
      } else {
        input.push({
          role: 'user',
          content: formatPrompt([
            '<example-submission>',
            example.submission_text,
            '</example-submission>',
            '<grading-result>',
            JSON.stringify(
              {
                score: example.score_perc,
                feedback: example.feedback?.manual?.trim() || '',
              },
              null,
              2,
            ),
            '</grading-result>',
          ]),
        });
      }
    }
  }

  const {
    submissionMessage, 
    submissionImages
  } = generateSubmissionMessage({
    submission_text,
    submitted_answer,
  });

  input.push(
    {
      role: systemRoleAfterUserMessage,
      content: 'The student made the following submission:',
    },
    submissionMessage,
    {
      role: systemRoleAfterUserMessage,
      content: 'Please grade the submission according to the above instructions.',
    },
  );

  return {
    input,
    submissionImages
  };
}

async function rotateBase64Image(
  base64Image: string, 
  /** Clockwise */
  angle: 90 | 180 | 270
): Promise<string> {
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const rotatedImageBuffer = await sharp(imageBuffer)
      .rotate(angle)
      .toBuffer();
  return rotatedImageBuffer.toString('base64');
}

/** 
 * Automatically rotates a provided image to the upright orientation using an AI model.
 * */
export async function correctHandwritingOrientation({
  image,
  model
}: {
  /** The original base64-encoded image submission. */
  image: string;
  model: LanguageModel;
}): Promise<string> {
  const rotated90 = await rotateBase64Image(image, 90);
  const rotated180 = await rotateBase64Image(image, 180);
  const rotated270 = await rotateBase64Image(image, 270);

  const input: ModelMessage[] = [];

  input.push({
    role: 'system',
    content: formatPrompt([
      'Of the four images provided, select the one that is closest to being upright.',
      'Upright (0 degrees): The handwriting is in a standard reading position already.',
      "Only use the student's handwriting to determine its orientation. Do not use the background or the page.",
    ])
  });

  const images = [
    image,
    rotated90,
    rotated180,
    rotated270,
  ];

  for (let i = 1; i <= 4; i++) {
    input.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${i}:` 
        },
        {
          type: 'image',
          image: `data:image/jpeg;base64,${images[i - 1]}`,
          providerOptions: {
            openai: {
              imageDetail: 'auto',
            },
          },
        },
      ]
    });
  }

  const RotationCorrectionSchema = z.object({
    upright_image: z.enum(['1', '2', '3', '4']).describe(
      'The number corresponding to the image that is closest to being upright.'
    )
  });

  const response = await generateObject({
    model,
    schema: RotationCorrectionSchema,
    messages: input,
  });

  const uprightImage = parseInt(response.object.upright_image);
  return images[uprightImage - 1];
}

/**
 * Returns true if the text contains any element with a `data-image-capture-uuid` attribute.
 */
export function containsImageCapture(submission_text: string): boolean {
  return cheerio.load(submission_text)('[data-image-capture-uuid]').length > 0;
}

/**
 * Parses the student's answer and the HTML of the student's submission to generate a message for the AI model.
 *
 * @param options
 * @param options.submission_text - The rendered HTML content of the student's submission.
 * @param options.submitted_answer - The student-submitted answer, potentially containing text and images.
 */
export function generateSubmissionMessage({
  submission_text,
  submitted_answer,
}: {
  submission_text: string;
  submitted_answer: Record<string, any> | null;
}): {
  submissionMessage: ModelMessage;
  submissionImages: {[key: string]: string};
} {
  const content: UserContent = [];

  // Walk through the submitted HTML from top to bottom, appending alternating text and image segments
  // to the message content to construct an AI-readable version of the submission.

  const $submission_html = cheerio.load(submission_text);
  let submissionTextSegment = '';

  let submissionImages: {[key: string]: string} = {};

  $submission_html
    .root()
    .find('body')
    .contents()
    .each((_, node) => {
      const imageCaptureUUID = $submission_html(node).data('image-capture-uuid');
      if (imageCaptureUUID) {
        if (submissionTextSegment) {
          // Push and reset the current text segment before adding the image.
          content.push({
            type: 'text',
            text: submissionTextSegment.trim(),
          });
          submissionTextSegment = '';
        }

        const fileName = run(() => {
          // New style, where `<pl-image-capture>` has been specialized for AI grading rendering.
          const submittedFileName = $submission_html(node).data('file-name');
          if (submittedFileName && typeof submittedFileName === 'string') {
            return submittedFileName.trim();
          }

          // Old style, where we have to pick the filename out of the `data-options` attribute.
          const options = $submission_html(node).data('options') as Record<string, string> | null;

          return options?.submitted_file_name;
        });

        if (!submitted_answer) {
          throw new Error('No submitted answers found.');
        }

        if (!fileName) {
          throw new Error('No file name found.');
        }

        const fileData = submitted_answer._files?.find(
          (file: { name: string; contents: string }) => file.name === fileName,
        );

        if (fileData) {
          // fileData.contents does not contain the MIME type header, so we add it.
          content.push({
            type: 'image',
            image: `data:image/jpeg;base64,${fileData.contents}`,
            providerOptions: {
              openai: {
                imageDetail: 'auto',
              },
            },
          });
          submissionImages[fileName] = fileData.contents;
        } else {
          // If the submitted answer doesn't contain the image, the student likely
          // didn't capture an image.
          content.push({
            type: 'text',
            text: `Image capture with ${fileName} was not captured.`,
          });
          return;
        }
      } else {
        submissionTextSegment += $submission_html(node).text();
      }
    });

  if (submissionTextSegment) {
    content.push({
      type: 'text',
      text: submissionTextSegment.trim(),
    });
  }

  return {
    submissionMessage: {
      role: 'user',
      content,
    },
    submissionImages
  };
}

export async function generateSubmissionEmbedding({
  course,
  question,
  instance_question,
  urlPrefix,
  embeddingModel,
}: {
  question: Question;
  course: Course;
  instance_question: InstanceQuestion;
  urlPrefix: string;
  embeddingModel: EmbeddingModel;
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
  const submission_text = render_submission_results.data.submissionHtmls[0];
  const embedding = await createEmbedding(embeddingModel, submission_text, `course_${course.id}`);
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

export async function selectInstanceQuestionsForAssessmentQuestion({
  assessment_question_id,
  closed_instance_questions_only = false,
  ungrouped_instance_questions_only = false,
}: {
  assessment_question_id: string;
  closed_instance_questions_only?: boolean;
  ungrouped_instance_questions_only?: boolean;
}): Promise<InstanceQuestion[]> {
  return await queryRows(
    sql.select_instance_questions_for_assessment_question,
    { assessment_question_id, closed_instance_questions_only, ungrouped_instance_questions_only },
    InstanceQuestionSchema,
  );
}

export async function selectRubricGradingItems(
  manual_rubric_grading_id: string | null,
): Promise<RubricItem[]> {
  return await queryRows(
    sql.select_rubric_grading_items,
    { manual_rubric_grading_id },
    RubricItemSchema,
  );
}

export async function insertAiGradingJob({
  grading_job_id,
  job_sequence_id,
  model_id,
  prompt,
  response,
  course_id,
  course_instance_id,
}: {
  grading_job_id: string;
  job_sequence_id: string;
  model_id: AiGradingModelId;
  prompt: ModelMessage[];
  response: GenerateObjectResult<any> | GenerateTextResult<any, any>;
  course_id: string;
  course_instance_id?: string;
}): Promise<void> {
  await execute(sql.insert_ai_grading_job, {
    grading_job_id,
    job_sequence_id,
    prompt: JSON.stringify(prompt),
    completion: response,
    model: model_id,
    prompt_tokens: response.usage.inputTokens ?? 0,
    completion_tokens: response.usage.outputTokens ?? 0,
    cost: calculateResponseCost({ model: model_id, usage: response.usage }),
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
}: {
  submission_id: string;
  assessment_question_id: string;
  embedding: string;
  limit: number;
}): Promise<GradedExample[]> {
  return await queryRows(
    sql.select_closest_submission_info,
    {
      submission_id,
      assessment_question_id,
      embedding,
      limit,
    },
    GradedExampleSchema,
  );
}

export async function selectRubricForGrading(
  assessment_question_id: string,
): Promise<RubricItem[]> {
  return await queryRows(
    sql.select_rubric_for_grading,
    { assessment_question_id },
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

export async function deleteAiGradingJobs({
  assessment_question_ids,
  authn_user_id,
}: {
  assessment_question_ids: string[];
  authn_user_id: string;
}) {
  // TODO: revisit this before general availability of AI grading. This implementation
  // was added primarily to facilitate demos at ASEE 2025. It may not behave completely
  // correctly in call cases; see the TODOs in the SQL query for more details.
  //
  // TODO: we should add locking here. Specifically, we should process each
  // assessment instance + instance question one at a time in separate
  // transactions so that we don't need to lock all relevant assessment instances
  // and assessment questions at once.
  const iqs = await runInTransactionAsync(async () => {
    const iqs = await queryRows(
      sql.delete_ai_grading_jobs,
      {
        authn_user_id,
        assessment_question_ids,
      },
      z.object({
        id: IdSchema,
        assessment_instance_id: IdSchema,
        max_points: AssessmentQuestionSchema.shape.max_points,
        max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
        max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
        points: InstanceQuestionSchema.shape.points,
        score_perc: InstanceQuestionSchema.shape.score_perc,
        auto_points: InstanceQuestionSchema.shape.auto_points,
        manual_points: InstanceQuestionSchema.shape.manual_points,
        most_recent_manual_grading_job: GradingJobSchema.nullable(),
      }),
    );

    for (const iq of iqs) {
      await callRow(
        'assessment_instances_grade',
        [
          iq.assessment_instance_id,
          // We use the user who is performing the deletion.
          authn_user_id,
          100, // credit
          false, // only_log_if_score_updated
          true, // allow_decrease
        ],
        SprocAssessmentInstancesGradeSchema,
      );
    }

    return iqs;
  });

  // Important: this is done outside of the above transaction so that we don't
  // hold a database connection open while we do network calls.
  //
  // This is here for consistency with other assessment score updating code. We
  // shouldn't hit this for the vast majority of assessments.
  for (const iq of iqs) {
    await ltiOutcomes.updateScore(iq.assessment_instance_id);
  }

  return iqs;
}

export async function toggleAiGradingMode(assessment_question_id: string): Promise<void> {
  await execute(sql.toggle_ai_grading_mode, { assessment_question_id });
}

export async function setAiGradingMode(assessment_question_id: string, ai_grading_mode: boolean) {
  await execute(sql.set_ai_grading_mode, { assessment_question_id, ai_grading_mode });
}
