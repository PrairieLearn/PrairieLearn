import {
  type GenerateObjectResult,
  type GenerateTextResult,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type UserContent,
  generateObject,
} from 'ai';
import * as cheerio from 'cheerio';
import { Redis } from 'ioredis';
import mustache from 'mustache';
import sharp from 'sharp';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import * as Sentry from '@prairielearn/sentry';
import { assertNever } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { calculateResponseCost, formatPrompt } from '../../../lib/ai-util.js';
import { updateAssessmentInstanceGrade } from '../../../lib/assessment-grading.js';
import { config } from '../../../lib/config.js';
import {
  AssessmentQuestionSchema,
  type CourseInstance,
  GradingJobSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  type RubricItem,
  RubricItemSchema,
  type Submission,
  SubmissionSchema,
  type Variant,
  VariantSchema,
} from '../../../lib/db-types.js';
import * as ltiOutcomes from '../../../lib/ltiOutcomes.js';
import { RedisRateLimiter } from '../../../lib/redis-rate-limiter.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';
import { type CounterClockwiseRotationDegrees, RotationCorrectionOutputSchema } from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});

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
  rubric_items,
  grader_guidelines,
  params,
  true_answer,
  model_id,
}: {
  questionPrompt: string;
  questionAnswer: string;
  submission_text: string;
  submitted_answer: Record<string, any> | null;
  rubric_items: RubricItem[];
  grader_guidelines: string | null;
  params: Record<string, any>;
  true_answer: Record<string, any>;
  model_id: AiGradingModelId;
}): Promise<ModelMessage[]> {
  const input: ModelMessage[] = [];

  const systemRoleAfterUserMessage = MODELS_SUPPORTING_SYSTEM_MSG_AFTER_USER_MSG.has(model_id)
    ? 'system'
    : 'user';

  const graderGuidelinesMessages = grader_guidelines
    ? ([
        {
          role: systemRoleAfterUserMessage,
          content: 'The instructor has provided the following grader guidelines:',
        },
        {
          role: 'user',
          content: mustache.render(grader_guidelines, {
            submitted_answers: submitted_answer,
            correct_answers: true_answer,
            params,
          }),
        },
      ] satisfies ModelMessage[])
    : [];

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
        ]),
      },
      ...graderGuidelinesMessages,
      {
        role: systemRoleAfterUserMessage,
        content: 'Here are the rubric items:',
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
    input.push(
      {
        role: 'system',
        content: formatPrompt([
          "You are an instructor for a course, and you are grading a student's response to a question.",
          'You will assign a numeric score between 0 and 100 (inclusive) to the student response,',
          "Include feedback for the student, but omit the feedback if the student's response is entirely correct.",
          'You must include an explanation on why you made these choices.',
          'Follow any special instructions given by the instructor in the question.',
        ]),
      },
      ...graderGuidelinesMessages,
    );
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

  input.push(
    {
      role: systemRoleAfterUserMessage,
      content: 'The student made the following submission:',
    },
    generateSubmissionMessage({
      submission_text,
      submitted_answer,
    }),
    {
      role: systemRoleAfterUserMessage,
      content: 'Please grade the submission according to the above instructions.',
    },
  );

  return input;
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
}): ModelMessage {
  const segments = parseSubmission({
    submission_text,
    submitted_answer,
  });

  const content: UserContent = segments.map((segment) => {
    switch (segment.type) {
      case 'text':
        return segment;
      case 'image':
        if (segment.fileData) {
          // fileData does not contain the MIME type header, so we add it.
          return {
            type: 'image',
            image: `data:image/jpeg;base64,${segment.fileData}`,
            providerOptions: {
              openai: {
                imageDetail: 'auto',
              },
            },
          };
        } else {
          return {
            type: 'text',
            text: `Image capture with ${segment.fileName} was not captured.`,
          };
        }
      default:
        assertNever(segment);
    }
  });

  return {
    role: 'user',
    content,
  };
}

type SubmissionHTMLSegment =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      fileName: string;
      /**
       * Base64-encoded image data. Does not include MIME type header
       * If null, the image was not found in the submitted answer.
       */
      fileData: string | null;
    };

/**
 * Helper function that returns parsed text and image segments from the HTML of a student submission.
 *
 * The submission HTML is expected to have already been processed by `stripHtmlForAiGrading`
 * (this happens in `freeform.ts` when `questionRenderContext === 'ai_grading'`). This function
 * preserves the full HTML structure for text segments, ensuring the prompt matches what the
 * instructor sees on the AI grading preview page. Images (identified by `data-image-capture-uuid`
 * attributes) are extracted and returned as separate segments.
 */
export function parseSubmission({
  submission_text,
  submitted_answer,
}: {
  submission_text: string;
  submitted_answer: Record<string, any> | null;
}): SubmissionHTMLSegment[] {
  const $ = cheerio.load(submission_text);
  const imageElements = $('[data-image-capture-uuid]');

  // If there are no images, return the full HTML as a single text segment.
  if (imageElements.length === 0) {
    const text = $('body').html()?.trim();
    if (!text) return [];
    return [{ type: 'text', text }];
  }

  // Extract image data and replace each image element with a unique marker
  // so we can split the HTML into alternating text/image segments.
  // The nonce prevents students from injecting markers into their submissions.
  const nonce = crypto.randomUUID();
  const imageDataByMarker = new Map<string, { fileName: string; fileData: string | null }>();

  imageElements.each((i, el) => {
    const marker = `__AI_GRADING_IMAGE_${nonce}_${i}__`;

    const fileName = run(() => {
      // New style, where `<pl-image-capture>` has been specialized for AI grading rendering.
      const submittedFileName = $(el).data('file-name');
      if (submittedFileName && typeof submittedFileName === 'string') {
        return submittedFileName.trim();
      }

      // Old style, where we have to pick the filename out of the `data-options` attribute.
      const options = $(el).data('options') as Record<string, string> | null;
      return options?.submitted_file_name;
    });

    if (!submitted_answer) {
      throw new Error('No submitted answers found.');
    }

    if (!fileName) {
      throw new Error('No file name found.');
    }

    const fileData =
      submitted_answer._files?.find(
        (file: { name: string; contents: string }) => file.name === fileName,
      )?.contents ?? null;

    imageDataByMarker.set(marker, { fileName, fileData });
    $(el).replaceWith(marker);
  });

  // Get the HTML with markers in place of images, then split on them.
  const htmlWithMarkers = $('body').html() ?? '';
  const parts = htmlWithMarkers.split(new RegExp(`(__AI_GRADING_IMAGE_${nonce}_\\d+__)`));

  const segments: SubmissionHTMLSegment[] = [];
  for (const part of parts) {
    const imageData = imageDataByMarker.get(part);
    if (imageData) {
      segments.push({
        type: 'image',
        fileName: imageData.fileName,
        fileData: imageData.fileData,
      });
    } else {
      const text = part.trim();
      if (text) {
        segments.push({ type: 'text', text });
      }
    }
  }

  return segments;
}

/**
 * Returns all images the student submitted via pl-image-capture.
 * Returns a mapping from an image's filename to its base64-encoded contents.
 */
export function extractSubmissionImages({
  submission_text,
  submitted_answer,
}: {
  submission_text: string;
  submitted_answer: Record<string, any>;
}): Record<string, string> {
  const segments = parseSubmission({
    submission_text,
    submitted_answer,
  });

  const images = segments.reduce(
    (acc, segment) => {
      if (segment.type === 'image' && segment.fileData) {
        acc[segment.fileName] = segment.fileData;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  return images;
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
    rotation_correction_degrees: null,
    model: model_id,
    prompt_tokens: response.usage.inputTokens ?? 0,
    completion_tokens: response.usage.outputTokens ?? 0,
    cost: calculateResponseCost({ model: model_id, usage: response.usage }),
    course_id,
    course_instance_id,
  });
}

/**
 * Create an AI grading job that performed rotation correction on its submitted images.
 * This accounts for all responses associated with detecting and correcting rotation issues.
 *
 * @param params
 * @param params.grading_job_id
 * @param params.job_sequence_id
 * @param params.model_id
 * @param params.prompt
 * @param params.gradingResponseWithRotationIssue - The initial AI grading response, wherein the LLM detected non-upright images.
 * @param params.rotationCorrections - For each image, the amount of degrees counterclockwise it was rotated and the response of the rotation correction LLM call.
 * @param params.gradingResponseWithRotationCorrection - The final AI grading response after rotation correction.
 * @param params.course_id
 * @param params.course_instance_id
 */
export async function insertAiGradingJobWithRotationCorrection({
  grading_job_id,
  job_sequence_id,
  model_id,
  prompt,
  gradingResponseWithRotationIssue,
  rotationCorrections,
  gradingResponseWithRotationCorrection,
  course_id,
  course_instance_id,
}: {
  grading_job_id: string;
  job_sequence_id: string;
  model_id: AiGradingModelId;
  prompt: ModelMessage[];
  gradingResponseWithRotationIssue: GenerateObjectResult<any>;
  rotationCorrections: Record<
    string,
    {
      degreesRotated: CounterClockwiseRotationDegrees;
      response: GenerateObjectResult<any>;
    }
  >;
  gradingResponseWithRotationCorrection: GenerateObjectResult<any> | GenerateTextResult<any, any>;
  course_id: string;
  course_instance_id?: string;
}): Promise<void> {
  let prompt_tokens =
    (gradingResponseWithRotationIssue.usage.inputTokens ?? 0) +
    (gradingResponseWithRotationCorrection.usage.inputTokens ?? 0);
  let completion_tokens =
    (gradingResponseWithRotationIssue.usage.outputTokens ?? 0) +
    (gradingResponseWithRotationCorrection.usage.outputTokens ?? 0);
  let cost =
    calculateResponseCost({
      model: model_id,
      usage: gradingResponseWithRotationIssue.usage,
    }) +
    calculateResponseCost({
      model: model_id,
      usage: gradingResponseWithRotationCorrection.usage,
    });

  const rotationCorrectionDegrees: Record<string, CounterClockwiseRotationDegrees> = {};
  for (const [filename, { degreesRotated, response }] of Object.entries(rotationCorrections)) {
    prompt_tokens += response.usage.inputTokens ?? 0;
    completion_tokens += response.usage.outputTokens ?? 0;
    cost += calculateResponseCost({ model: model_id, usage: response.usage });
    rotationCorrectionDegrees[filename] = degreesRotated;
  }

  await execute(sql.insert_ai_grading_job, {
    grading_job_id,
    job_sequence_id,
    prompt: JSON.stringify(prompt),
    completion: gradingResponseWithRotationCorrection,
    rotation_correction_degrees: rotationCorrectionDegrees,
    model: model_id,
    prompt_tokens,
    completion_tokens,
    cost,
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

export async function selectLastSubmissionId(instance_question_id: string): Promise<string> {
  return await queryRow(sql.select_last_submission_id, { instance_question_id }, IdSchema);
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
      await updateAssessmentInstanceGrade({
        assessment_instance_id: iq.assessment_instance_id,
        // We use the user who is performing the deletion.
        authn_user_id,
        credit: 100,
        allowDecrease: true,
      });
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

const rateLimiter = new RedisRateLimiter({
  redis: () => {
    if (!config.nonVolatileRedisUrl) {
      // Redis is a hard requirement for AI grading. We don't attempt
      // to operate without it.
      throw new Error('nonVolatileRedisUrl must be set in config');
    }

    const redis = new Redis(config.nonVolatileRedisUrl);

    redis.on('error', (err) => {
      logger.error('AI grading Redis error', err);

      // This error could happen during a specific request, but we shouldn't
      // associate it with that request - we just happened to try to set up
      // Redis during a given request. We'll use a fresh scope to capture this.
      Sentry.withScope((scope) => {
        scope.clear();
        Sentry.captureException(err);
      });
    });
    return redis;
  },
  keyPrefix: () => config.cacheKeyPrefix + 'ai-grading-usage:',
  intervalSeconds: 3600,
});

/**
 * Retrieve the Redis key for the current AI grading interval usage of a course instance
 */
function getIntervalUsageKey(courseInstance: CourseInstance) {
  return `course-instance:${courseInstance.id}`;
}

/**
 * Retrieve the AI grading usage for the course instance in the last hour interval, in US dollars
 */
export async function getIntervalUsage(courseInstance: CourseInstance) {
  return rateLimiter.getIntervalUsage(getIntervalUsageKey(courseInstance));
}

/**
 * Add the cost of an AI grading to the usage of the course instance for the current interval.
 */
export async function addAiGradingCostToIntervalUsage({
  courseInstance,
  model,
  usage,
}: {
  courseInstance: CourseInstance;
  model: keyof (typeof config)['costPerMillionTokens'];
  usage: LanguageModelUsage;
}) {
  const responseCost = calculateResponseCost({ model, usage });
  await rateLimiter.addToIntervalUsage(getIntervalUsageKey(courseInstance), responseCost);
}

/**
 * Rotates a base64-encoded image by the specified counterclockwise rotation.
 *
 * @param base64Image - The base64-encoded image to rotate.
 * @param rotation - The amount of counterclockwise rotation to apply (in degrees).
 */
async function rotateBase64Image(
  base64Image: string,
  rotation: CounterClockwiseRotationDegrees,
): Promise<string> {
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // The sharp rotate method uses clockwise rotation, so we convert.
  const clockwiseRotation = (360 - rotation) % 360;

  const rotatedImageBuffer = await sharp(imageBuffer).rotate(clockwiseRotation).toBuffer();
  return rotatedImageBuffer.toString('base64');
}

/**
 * Reorients a base64-encoded image to be upright using an LLM.
 * Designed specifically for images of handwritten student submissions.
 *
 * The function rotates the image 0, 90, 180, and 270 degrees counterclockwise, then
 * prompts the LLM to select which of the four images is closest to being upright.
 *
 * @param params
 * @param params.image - The base64-encoded image to correct.
 * @param params.model - The LLM to use for determining the correct orientation.
 */
async function correctImageOrientation({
  image,
  model,
}: {
  image: string;
  model: LanguageModel;
}): Promise<{
  correctedImage: string;
  degreesRotated: CounterClockwiseRotationDegrees;
  response: GenerateObjectResult<any>;
}> {
  const rotated90 = await rotateBase64Image(image, 90);
  const rotated180 = await rotateBase64Image(image, 180);
  const rotated270 = await rotateBase64Image(image, 270);

  const prompt: ModelMessage[] = [
    {
      role: 'system',
      content: formatPrompt([
        'Of the four images provided, select the one that is closest to being upright.',
        'Upright (0 degrees): The handwriting is in a standard reading position already.',
        "Only use the student's handwriting to determine its orientation. Do not use the background or the page.",
      ]),
    },
  ];

  const images = [image, rotated90, rotated180, rotated270];

  const rotationCorrectionDegrees: CounterClockwiseRotationDegrees[] = [0, 90, 180, 270];

  for (let i = 1; i <= 4; i++) {
    prompt.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${i}:`,
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
      ],
    });
  }

  const response = await generateObject({
    model,
    schema: RotationCorrectionOutputSchema,
    messages: prompt,
  });

  const index = Number.parseInt(response.object.upright_image) - 1;

  return {
    correctedImage: images[index],
    degreesRotated: rotationCorrectionDegrees[index],
    response,
  };
}

/**
 * Reorients all submitted images to be upright using the provided LLM.
 *
 * @param param
 * @param param.submittedAnswer - The student's submitted answer object.
 * @param param.submittedImages - A mapping from filenames to base64-encoded images.
 * @param param.model - The LLM to use for determining the correct orientations.
 *
 * @returns An updated submitted answer with corrected images, rotations correction amounts, and LLM responses.
 */
export async function correctImagesOrientation({
  submittedAnswer,
  /** The key is the filename, and the value is the base64-encoded image */
  submittedImages,
  model,
}: {
  submittedAnswer: Record<string, any>;
  submittedImages: Record<string, string>;
  model: LanguageModel;
}) {
  if (!submittedAnswer._files) {
    return {
      rotatedSubmittedAnswer: submittedAnswer,
      rotationCorrections: {},
    };
  }

  const rotatedSubmittedAnswer = {
    ...submittedAnswer,
    _files: submittedAnswer._files.map((file: { name: string; contents: string }) => ({ ...file })),
  };

  const rotationCorrections: Record<
    string,
    {
      degreesRotated: CounterClockwiseRotationDegrees;
      response: GenerateObjectResult<any>;
    }
  > = {};

  for (const [filename, image] of Object.entries(submittedImages)) {
    const { correctedImage, degreesRotated, response } = await correctImageOrientation({
      image,
      model,
    });

    const existingIndex = submittedAnswer._files.findIndex(
      (file: { name: string; contents: string }) => file.name === filename,
    );

    if (existingIndex !== -1) {
      rotatedSubmittedAnswer._files[existingIndex].contents = correctedImage;
    }

    rotationCorrections[filename] = {
      degreesRotated,
      response,
    };
  }

  return {
    rotatedSubmittedAnswer,
    rotationCorrections,
  };
}
/**
 * Correct malformed AI rubric grading responses from Google Gemini by escaping backslashes in rubric item keys.
 *
 * TODO: Remove this function once Google fixes the underlying issue. This is a temporary workaround.
 * Issue on the Google GenAI repository: https://github.com/googleapis/js-genai/issues/1226#issue-3783507624
 *
 * If a rubric item key contains escaped backslashes, Google Gemini generates
 * unescaped backslashes in the JSON response, leading to a JSON parsing error.
 *
 * Example: Rubric item key \\mathbb{x} gets generated as \mathbb{x}, which is invalid JSON since
 * it contains an unescaped backslash.
 *
 * This function escapes all backslashes of rubric item keys in the JSON response.
 *
 * @param rawResponseText - The raw AI grading response returned from the Gemini model.
 * - The response must be a JSON string containing a "rubric_items" key.
 * - The "rubric_items" key must be the last key in the JSON object.
 *
 * @returns The corrected JSON as a string, or null if it could not be corrected.
 */
export function correctGeminiMalformedRubricGradingJson(rawResponseText: string): string | null {
  const RUBRIC_ITEMS_KEY = '"rubric_items":';

  const startRubric = rawResponseText.indexOf(RUBRIC_ITEMS_KEY);
  if (startRubric === -1) return null;

  // The rubric items object starts right after the "rubric_items": key.
  const rubricItemsRaw = rawResponseText.slice(startRubric + RUBRIC_ITEMS_KEY.length).trim();

  // Gemini sometimes returns unescaped backslashes in the rubric item keys.
  // We need to escape them properly.
  // This only changes the keys of rubricItemsRaw since its values are all booleans.
  const correctedRubricItems = rubricItemsRaw.replaceAll('\\', '\\\\');

  // All characters before the rubric items, including the "rubric_items": key.
  const charactersBeforeRubricItemsObject = rawResponseText.slice(
    0,
    startRubric + RUBRIC_ITEMS_KEY.length,
  );

  return `${charactersBeforeRubricItemsObject} ${correctedRubricItems}`;
}
