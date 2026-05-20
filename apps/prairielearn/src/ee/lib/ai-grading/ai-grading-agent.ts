import assert from 'node:assert';

import { createOpenAI } from '@ai-sdk/openai';
import {
  type LanguageModel,
  type ModelMessage,
  ToolLoopAgent,
  type ToolSet,
  generateObject,
  stepCountIs,
  tool,
} from 'ai';
import z from 'zod';

import { execute, loadSqlEquiv, queryOptionalScalar, queryRow } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import {
  type AiGradingMessage,
  AiGradingMessageSchema,
  type Assessment,
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  EnumAiQuestionGenerationMessageStatusSchema,
  type Question,
} from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { selectAssessmentQuestionById } from '../../../models/assessment-question.js';
import * as questionServers from '../../../question-servers/index.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';
import {
  generateSubmissionMessage,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';

const sql = loadSqlEquiv(import.meta.url);

const AGENTIC_AI_GRADING_MODEL: AiGradingModelId = 'gpt-5.4-2026-03-05';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

function getAgenticGradingModel(): { model: LanguageModel; modelId: AiGradingModelId } {
  assert(config.aiGradingOpenAiApiKey, 'AI grading OpenAI API key is not configured');
  const openai = createOpenAI({
    apiKey: config.aiGradingOpenAiApiKey,
    organization: config.aiGradingOpenAiOrganization ?? undefined,
  });
  const modelId = AGENTIC_AI_GRADING_MODEL;
  return { model: openai(modelId), modelId };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RubricOutputSchema = z.object({
  rubric_items: z.array(
    z.object({
      points: z.coerce.number(),
      description: z
        .string()
        .max(100)
        .describe('Short rubric item label. MUST be 100 characters or fewer.'),
      explanation: z
        .string()
        .nullable()
        .describe('Detailed explanation shown to students. Max 10,000 characters.'),
      grader_note: z
        .string()
        .nullable()
        .describe('Private note for graders only. Max 10,000 characters.'),
      always_show_to_students: z.boolean(),
    }),
  ),
  starting_points: z.coerce.number(),
  replace_auto_points: z.boolean(),
  min_points: z.coerce.number(),
  max_extra_points: z.coerce.number(),
  grader_guidelines: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Rubric point validation
// ---------------------------------------------------------------------------

interface RubricPointValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  computed: {
    raw_min: number;
    raw_max: number;
    expected_min: number;
    expected_max: number;
    positive_item_sum: number;
    negative_item_sum: number;
  };
}

function validateRubricPoints({
  rubricItems,
  startingPoints,
  minPoints,
  maxExtraPoints,
  questionMaxPoints,
}: {
  rubricItems: { points: number }[];
  startingPoints: number;
  minPoints: number;
  maxExtraPoints: number;
  questionMaxPoints: number;
}): RubricPointValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const positiveSum = rubricItems.reduce((sum, item) => sum + Math.max(0, item.points), 0);
  const negativeSum = rubricItems.reduce((sum, item) => sum + Math.min(0, item.points), 0);

  const rawMin = startingPoints + negativeSum;
  const rawMax = startingPoints + positiveSum;

  const expectedMin = minPoints;
  const expectedMax = questionMaxPoints + maxExtraPoints;

  if (rawMin !== expectedMin) {
    errors.push(
      `Minimum raw score (starting_points ${startingPoints} + negative items ${negativeSum} = ${rawMin}) ` +
        `does not equal min_points (${expectedMin}). ` +
        'Adjust rubric items, starting_points, or min_points so they match.',
    );
  }

  if (rawMax !== expectedMax) {
    errors.push(
      `Maximum raw score (starting_points ${startingPoints} + positive items ${positiveSum} = ${rawMax}) ` +
        `does not equal expected maximum (question max ${questionMaxPoints} + max extra credit ${maxExtraPoints} = ${expectedMax}). ` +
        'Adjust rubric items, starting_points, or max_extra_points so they match.',
    );
  }

  if (minPoints < 0) {
    warnings.push('min_points is negative — students can receive negative scores.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    computed: {
      raw_min: rawMin,
      raw_max: rawMax,
      expected_min: expectedMin,
      expected_max: expectedMax,
      positive_item_sum: positiveSum,
      negative_item_sum: negativeSum,
    },
  };
}

function getQuestionMaxPoints(
  assessmentQuestion: AssessmentQuestion,
  replaceAutoPoints: boolean,
): number {
  return replaceAutoPoints
    ? (assessmentQuestion.max_points ?? 0)
    : (assessmentQuestion.max_manual_points ?? 0);
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const AI_GRADING_TOOLS = {
  generateRubric: tool({
    description:
      'Generate a rubric from scratch by analyzing sample student submissions. This calls an inner LLM to produce the rubric and saves it to the database.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
  }),
  getRubric: tool({
    description:
      'Get the full current rubric including all items. Each item includes a rubric_item_id (database ID) and a display_index (1-based position shown to users). Use rubric_item_id for other tool calls. Users may refer to items by display_index.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
  }),
  getRubricItem: tool({
    description: 'Get a specific rubric item by its database ID.',
    inputSchema: z.object({
      rubric_item_id: z.string().describe('The database ID of the rubric item'),
    }),
    outputSchema: z.string(),
  }),
  addRubricItem: tool({
    description:
      'Add a new rubric item to the rubric. Returns the updated rubric state after the addition.',
    inputSchema: z.object({
      points: z.number().describe('Points for this item (positive or negative)'),
      description: z.string().max(100).describe('Short description (max 100 chars)'),
      explanation: z.string().nullable().describe('Detailed explanation for students'),
      grader_note: z.string().nullable().describe('Internal note for graders'),
      always_show_to_students: z.boolean().describe('Whether to always show this item to students'),
      position: z
        .number()
        .optional()
        .describe('0-based position to insert at (default: end of list)'),
    }),
    outputSchema: z.string(),
  }),
  editRubricItem: tool({
    description:
      'Edit an existing rubric item. Only provided fields are changed. Returns the updated rubric state after the edit.',
    inputSchema: z.object({
      rubric_item_id: z.string().describe('The database ID of the rubric item to edit'),
      points: z.number().optional().describe('New points value'),
      description: z.string().max(100).optional().describe('New description (max 100 chars)'),
      explanation: z.string().nullable().optional().describe('New explanation'),
      grader_note: z.string().nullable().optional().describe('New grader note'),
      always_show_to_students: z.boolean().optional(),
    }),
    outputSchema: z.string(),
  }),
  deleteRubricItem: tool({
    description:
      'Delete a rubric item by its database ID. Returns the updated rubric state after the deletion.',
    inputSchema: z.object({
      rubric_item_id: z.string().describe('The database ID of the rubric item to delete'),
    }),
    outputSchema: z.string(),
  }),
  swapRubricItems: tool({
    description:
      'Swap the positions of two rubric items. Returns the updated rubric state after the swap.',
    inputSchema: z.object({
      rubric_item_id_a: z.string().describe('Database ID of the first rubric item'),
      rubric_item_id_b: z.string().describe('Database ID of the second rubric item'),
    }),
    outputSchema: z.string(),
  }),
  editRubricSettings: tool({
    description:
      'Edit rubric-level settings. Only provided fields are changed. grader_guidelines are high-level instructions for graders (not specific to any rubric item). replace_auto_points controls whether the rubric replaces the full question score (true) or only the manual portion (false). Returns the updated rubric state. You CANNOT change the assessment question point values — those are fixed by the instructor.',
    inputSchema: z.object({
      grader_guidelines: z
        .string()
        .nullable()
        .optional()
        .describe('High-level instructions for graders'),
      replace_auto_points: z
        .boolean()
        .optional()
        .describe('Whether the rubric replaces the full question score'),
      starting_points: z
        .number()
        .optional()
        .describe('Starting points before rubric items are applied'),
      min_points: z.number().optional().describe('Minimum possible score (floor)'),
      max_extra_points: z
        .number()
        .optional()
        .describe('Maximum extra credit beyond the question max'),
    }),
    outputSchema: z.string(),
  }),
  getAssessmentQuestionPoints: tool({
    description:
      'Get the assessment question point values. These are fixed by the instructor and cannot be changed. Use this to understand the point range your rubric should cover.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
  }),
  getQuestionContent: tool({
    description:
      'Get the rendered question prompt and solution/answer HTML. Use this to understand what the question asks and what the correct answer looks like when creating or refining rubric items.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
  }),
  getSampleSubmissions: tool({
    description:
      'Get a batch of sample student submissions. The tool result includes a text summary of each submission AND any uploaded image attachments inline. IMPORTANT: image attachments are only visible to you on the call where they were just fetched and the steps immediately following. Once you call getSampleSubmissions again (or finish reasoning about the current batch), images from the OLDER call are stripped from your context — only the text summary remains. If you need to look at images of student work again, call getSampleSubmissions again.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
  }),
  revertRubric: tool({
    description:
      'Atomically revert the rubric to the state it was in right after a specific message. Call this when the user asks to revert. Use message_id="0" to revert to the initial rubric state before any AI changes were made.',
    inputSchema: z.object({
      message_id: z
        .string()
        .regex(/^\d+$/, 'message_id must be a non-negative integer string')
        .describe(
          'The database ID of the message to revert to. "0" = initial rubric state before any AI changes. Any other value = rubric state right after that message.',
        ),
    }),
    outputSchema: z.string(),
  }),
} satisfies ToolSet;

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const RUBRIC_GENERATION_SYSTEM_PROMPT = [
  'You are a rubric creation assistant for a course.',
  'Given a batch of student submissions, generate a cohesive rubric based on them.',
  'Questions students received were programmatically generated and randomized. Avoid hardcoding randomized quantities and final solutions.',
  'This rubric should work for any random variant of the question.',
  'Rubric items are binary: full credit or no credit. Account for nuances by creating separate items.',
  'Create comprehensive rubric items that cover the key aspects of the assignment.',
  'IMPORTANT: All rubric text (descriptions, explanations, grader notes) MUST be written entirely in English. Do not use any non-English characters, including Chinese, Japanese, or other non-Latin scripts.',
].join(' ');

const RUBRIC_GENERATION_AGENT_SYSTEM_PROMPT = [
  'You are a rubric creation assistant for a course.',
  'You have access to tools to generate and refine rubrics.',
  'Start by calling the generateRubric tool to create an initial rubric from sample submissions.',
  'After generation, you may optionally refine the rubric using surgical editing tools (addRubricItem, editRubricItem, deleteRubricItem, swapRubricItems).',
  'You can also use editRubricSettings to set grader_guidelines (high-level instructions for graders), starting_points, min_points, max_extra_points, and replace_auto_points.',
  'Use getRubric to see the current state of the rubric at any time. Use getAssessmentQuestionPoints to see the fixed point values.',
  'Use getQuestionContent to see the question prompt and solution. Use getSampleSubmissions to see how students answered — images uploaded by students are attached inline to the tool result. To save context, images from PRIOR getSampleSubmissions calls are stripped once a newer call is made or after a few subsequent steps; if you need to look at student images again, call getSampleSubmissions again rather than trying to recall them.',
  'CRITICAL: If a tool result includes a non-empty `errors` array, a `render_errors` object, or an `error` field, you MUST explicitly tell the user in your final reply that an error occurred. If the error mentions rendering, tell them to verify the question/submissions render correctly. Otherwise, say "an error occurred while reading the content." Never produce a final reply that omits these errors — even if the rubric was otherwise generated or edited successfully, the user needs to know the underlying content was incomplete.',
  'When referring to rubric items, use the rubric_item_id (database ID) from getRubric, not display indices.',
  'Users may refer to items by their display number (1-based), so map those to the correct rubric_item_id.',
  'IMPORTANT: Rubric point values must be logically consistent. The response from getRubric includes a point_validation section.',
  'For positive grading: min_points should match the minimum attainable score, and question_max_points + max_extra_points should match the maximum attainable score.',
  'For negative grading: starting_points is near the max, items subtract points down to min_points.',
  'You cannot change the assessment question point values — those are fixed by the instructor.',
  'After generating and optionally refining the rubric, respond with 1-2 short sentences.',
  'A detailed diff of all rubric changes is automatically shown to the user, so do NOT list or describe individual items or changes. Keep your response extremely brief.',
  'Your text responses are rendered as Markdown with MathJax. Use $...$ for inline math and $$...$$ for display math.',
  'IMPORTANT: All rubric text (descriptions, explanations, grader notes, guidelines) MUST be written entirely in English. Do not use any non-English characters, including Chinese, Japanese, or other non-Latin scripts.',
].join(' ');

const RUBRIC_EDITING_AGENT_SYSTEM_PROMPT = [
  'You are a lead teaching assistant for a course.',
  'You help instructors create and modify rubrics.',
  'IMPORTANT: You MUST always start by calling getRubric to see the current rubric state before making any changes.',
  "If no rubric exists yet, call generateRubric to create one from sample submissions first. You can also incorporate the user's instructions when generating.",
  'Use addRubricItem, editRubricItem, deleteRubricItem, and swapRubricItems to make targeted changes.',
  'Use editRubricSettings to change grader_guidelines (high-level instructions for graders — NOT specific to any item; use rubric item grader_note for item-specific instructions), starting_points, min_points, max_extra_points, or replace_auto_points.',
  'Use getAssessmentQuestionPoints to see the fixed point values set by the instructor.',
  'Use getQuestionContent to see the question prompt and solution. Use getSampleSubmissions to see how students answered — images uploaded by students are attached inline to the tool result. To save context, images from PRIOR getSampleSubmissions calls are stripped once a newer call is made or after a few subsequent steps; if you need to look at student images again, call getSampleSubmissions again rather than trying to recall them.',
  'CRITICAL: If a tool result includes a non-empty `errors` array, a `render_errors` object, or an `error` field, you MUST explicitly tell the user in your final reply that an error occurred. If the error mentions rendering, tell them to verify the question/submissions render correctly. Otherwise, say "an error occurred while reading the content." Never produce a final reply that omits these errors — even if the rubric was otherwise generated or edited successfully, the user needs to know the underlying content was incomplete.',
  'When the user asks to change multiple items (e.g. "remove all explanations"), call editRubricItem for EACH affected item.',
  'When referring to rubric items, use the rubric_item_id (database ID) from getRubric, not display indices.',
  'Users may refer to items by their display number (1-based), so map those to the correct rubric_item_id.',
  'When the user asks to revert the rubric, call the revertRubric tool with the message_id they specify. Use message_id="0" for the initial state. Do NOT manually edit individual items to revert — always use the revertRubric tool.',
  'IMPORTANT: After making changes, check the point_validation in the getRubric response. If there are errors, fix them immediately by adjusting items or settings.',
  'You may temporarily go outside valid point ranges during multi-step edits, but you must correct any validation errors before finishing.',
  'Rubric items are binary: full credit or no credit. Account for nuances by creating separate items.',
  'Questions students received were programmatically generated and randomized. Avoid hardcoding randomized quantities and final solutions.',
  'You cannot change the assessment question point values — those are fixed by the instructor.',
  'After making changes, respond with 1-2 short sentences. The user already sees the rubric and a detailed diff of changes, so do NOT list or describe individual items or changes. Keep your response extremely brief.',
  'Your text responses are rendered as Markdown with MathJax. Use $...$ for inline math and $$...$$ for display math.',
  'IMPORTANT: All rubric text (descriptions, explanations, grader notes, guidelines) MUST be written entirely in English. Do not use any non-English characters, including Chinese, Japanese, or other non-Latin scripts.',
].join(' ');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffRubricState {
  settings: Record<string, unknown> | null;
  rubric_items: Record<string, unknown>[];
}

export interface AiGradingAgentContext {
  assessment: Assessment;
  assessmentQuestion: AssessmentQuestion;
  course: Course;
  courseInstance: CourseInstance;
  question: Question;
  urlPrefix: string;
  authnUserId: string;
  userId: string;
  hasCourseInstancePermissionEdit: boolean;
}

interface JobLogger {
  info(msg: string): void;
  error(msg: string): void;
}

interface RenderedSampleSubmission {
  instance_question_id: string;
  submission_message: ModelMessage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTextFromParts(parts: AiGradingMessage['parts']): string {
  return parts
    .map((part: { type: string; text?: string }) => (part.type === 'text' ? (part.text ?? '') : ''))
    .filter((text: string) => text.length > 0)
    .join(' ');
}

// ---------------------------------------------------------------------------
// Rubric read helpers
// ---------------------------------------------------------------------------

async function getCurrentRubricItems(context: AiGradingAgentContext) {
  const freshAq = await selectAssessmentQuestionById(context.assessmentQuestion.id);
  const rubricData = await manualGrading.selectRubricData({
    assessment_question: freshAq,
  });
  return rubricData;
}

interface RubricItemForEdit {
  id?: string;
  order: number;
  points: number;
  description: string;
  explanation: string | null;
  grader_note: string | null;
  always_show_to_students: boolean;
}

function rubricDataToItems(
  rubricData: NonNullable<Awaited<ReturnType<typeof getCurrentRubricItems>>>,
): RubricItemForEdit[] {
  return rubricData.rubric_items.map((i) => ({
    id: i.rubric_item.id,
    order: i.rubric_item.number,
    points: i.rubric_item.points,
    description: i.rubric_item.description,
    explanation: i.rubric_item.explanation,
    grader_note: i.rubric_item.grader_note,
    always_show_to_students: i.rubric_item.always_show_to_students,
  }));
}

async function saveRubricItems(
  context: AiGradingAgentContext,
  rubricData: NonNullable<Awaited<ReturnType<typeof getCurrentRubricItems>>>,
  items: RubricItemForEdit[],
) {
  await manualGrading.updateAssessmentQuestionRubric({
    assessment: context.assessment,
    assessment_question_id: context.assessmentQuestion.id,
    use_rubric: true,
    replace_auto_points: rubricData.rubric.replace_auto_points,
    starting_points: rubricData.rubric.starting_points,
    min_points: rubricData.rubric.min_points,
    max_extra_points: rubricData.rubric.max_extra_points,
    rubric_items: items.map((item, idx) => ({
      id: item.id,
      order: idx,
      points: item.points,
      description: item.description,
      explanation: item.explanation ?? '',
      grader_note: item.grader_note ?? '',
      always_show_to_students: item.always_show_to_students,
    })),
    tag_for_manual_grading: false,
    grader_guidelines: rubricData.rubric.grader_guidelines,
    authn_user_id: context.authnUserId,
  });
}

async function formatCurrentRubricState(context: AiGradingAgentContext): Promise<string> {
  const rubricData = await getCurrentRubricItems(context);
  if (!rubricData) {
    return JSON.stringify({
      rubric_exists: false,
      message:
        'No rubric has been created yet. This is the expected starting state — call generateRubric to create one. Do not treat this as an error.',
    });
  }
  const items = rubricData.rubric_items.map((i, idx) => ({
    rubric_item_id: i.rubric_item.id,
    display_index: idx + 1,
    points: i.rubric_item.points,
    description: i.rubric_item.description,
    explanation: i.rubric_item.explanation,
    grader_note: i.rubric_item.grader_note,
    always_show_to_students: i.rubric_item.always_show_to_students,
  }));

  const questionMaxPoints = getQuestionMaxPoints(
    context.assessmentQuestion,
    rubricData.rubric.replace_auto_points,
  );

  const validation = validateRubricPoints({
    rubricItems: rubricData.rubric_items.map((i) => ({ points: i.rubric_item.points })),
    startingPoints: rubricData.rubric.starting_points,
    minPoints: rubricData.rubric.min_points,
    maxExtraPoints: rubricData.rubric.max_extra_points,
    questionMaxPoints,
  });

  return JSON.stringify(
    {
      settings: {
        starting_points: rubricData.rubric.starting_points,
        replace_auto_points: rubricData.rubric.replace_auto_points,
        min_points: rubricData.rubric.min_points,
        max_extra_points: rubricData.rubric.max_extra_points,
        grader_guidelines: rubricData.rubric.grader_guidelines,
      },
      question_max_points: questionMaxPoints,
      rubric_items: items,
      point_validation: validation,
    },
    null,
    2,
  );
}

async function getRubricSnapshot(
  context: AiGradingAgentContext,
): Promise<{ settings: Record<string, unknown> | null; rubric_items: Record<string, unknown>[] }> {
  const rubricData = await getCurrentRubricItems(context);
  if (!rubricData) {
    return { settings: null, rubric_items: [] };
  }
  return {
    settings: {
      starting_points: rubricData.rubric.starting_points,
      replace_auto_points: rubricData.rubric.replace_auto_points,
      min_points: rubricData.rubric.min_points,
      max_extra_points: rubricData.rubric.max_extra_points,
      grader_guidelines: rubricData.rubric.grader_guidelines,
    },
    rubric_items: rubricData.rubric_items.map((i, idx) => ({
      rubric_item_id: i.rubric_item.id,
      display_index: idx + 1,
      points: i.rubric_item.points,
      description: i.rubric_item.description,
      explanation: i.rubric_item.explanation,
      grader_note: i.rubric_item.grader_note,
      always_show_to_students: i.rubric_item.always_show_to_students,
    })),
  };
}

async function formatMutationResult(
  context: AiGradingAgentContext,
  beforeSnapshot: Awaited<ReturnType<typeof getRubricSnapshot>>,
): Promise<string> {
  const afterSnapshot = await getRubricSnapshot(context);
  const afterStateStr = await formatCurrentRubricState(context);
  const afterState = JSON.parse(afterStateStr);
  return JSON.stringify({ ...afterState, before: beforeSnapshot, after: afterSnapshot });
}

// ---------------------------------------------------------------------------
// Rubric snapshot capture (for persisting on message rows)
// ---------------------------------------------------------------------------

export async function captureRubricSnapshot(
  assessmentQuestionId: string,
): Promise<DiffRubricState | null> {
  const assessmentQuestion = await selectAssessmentQuestionById(assessmentQuestionId);
  const rubricData = await manualGrading.selectRubricData({
    assessment_question: assessmentQuestion,
  });
  if (!rubricData) return null;
  return {
    settings: {
      starting_points: rubricData.rubric.starting_points,
      replace_auto_points: rubricData.rubric.replace_auto_points,
      min_points: rubricData.rubric.min_points,
      max_extra_points: rubricData.rubric.max_extra_points,
      grader_guidelines: rubricData.rubric.grader_guidelines,
    },
    rubric_items: rubricData.rubric_items.map((i, idx) => ({
      rubric_item_id: i.rubric_item.id,
      display_index: idx + 1,
      points: i.rubric_item.points,
      description: i.rubric_item.description,
      explanation: i.rubric_item.explanation,
      grader_note: i.rubric_item.grader_note,
      always_show_to_students: i.rubric_item.always_show_to_students,
    })),
  };
}

// ---------------------------------------------------------------------------
// Context gathering helpers
// ---------------------------------------------------------------------------

const MAX_SUBMISSION_TEXT_CHARS = 4000;

interface SubmissionImage {
  data: string;
  mediaType: string;
}

function extractSubmissionParts(content: unknown): {
  text: string;
  images: SubmissionImage[];
} {
  if (typeof content === 'string') {
    return { text: truncate(content, MAX_SUBMISSION_TEXT_CHARS), images: [] };
  }
  if (!Array.isArray(content)) {
    return { text: '[submission content unavailable]', images: [] };
  }
  const textParts: string[] = [];
  const images: SubmissionImage[] = [];
  for (const segment of content) {
    if (segment && typeof segment === 'object' && 'type' in segment) {
      const s = segment as {
        type: string;
        text?: string;
        image?: string;
        mediaType?: string;
      };
      if (s.type === 'text' && typeof s.text === 'string') {
        textParts.push(s.text);
      } else if (s.type === 'image' && typeof s.image === 'string') {
        images.push({ data: s.image, mediaType: s.mediaType ?? 'image/jpeg' });
      }
    }
  }
  const combined = textParts.join('\n').trim();
  const text = truncate(
    combined.length > 0 ? combined : '[no text content in submission]',
    MAX_SUBMISSION_TEXT_CHARS,
  );
  return { text, images };
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n[...truncated ${text.length - maxChars} characters]`;
}

function extractTextFromToolResultOutput(output: unknown): string {
  if (output == null || typeof output !== 'object') return '';
  const o = output as { type?: string; value?: unknown };
  if (o.type === 'text' && typeof o.value === 'string') return o.value;
  if (o.type === 'content' && Array.isArray(o.value)) {
    return o.value
      .map((v: unknown) => {
        if (v && typeof v === 'object' && 'type' in v) {
          const seg = v as { type: string; text?: string };
          if (seg.type === 'text' && typeof seg.text === 'string') return seg.text;
        }
        return '';
      })
      .filter((s) => s.length > 0)
      .join('\n');
  }
  if (o.type === 'json') {
    try {
      return JSON.stringify(o.value);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Removes image data from older `getSampleSubmissions` tool results, leaving
 * only the most recent one intact. Images are heavy (base64 photos) and
 * accumulating them across tool-loop steps quickly blows the model's context
 * window. The agent still has the textual summary of older calls, plus full
 * image visibility for whatever it just fetched.
 */
function stripOlderSubmissionImages(messages: ModelMessage[]): ModelMessage[] {
  let mostRecent: { msgIdx: number; partIdx: number } | null = null;
  for (let i = messages.length - 1; i >= 0 && !mostRecent; i--) {
    const msg = messages[i];
    if (msg.role !== 'tool' || !Array.isArray(msg.content)) continue;
    for (let j = msg.content.length - 1; j >= 0; j--) {
      const part = msg.content[j] as { type: string; toolName?: string };
      if (part.type === 'tool-result' && part.toolName === 'getSampleSubmissions') {
        mostRecent = { msgIdx: i, partIdx: j };
        break;
      }
    }
  }
  if (!mostRecent) return messages;

  return messages.map((msg, mi) => {
    if (msg.role !== 'tool' || !Array.isArray(msg.content)) return msg;
    return {
      ...msg,
      content: msg.content.map((part, pi) => {
        if (
          (part as { type: string }).type !== 'tool-result' ||
          (part as { toolName?: string }).toolName !== 'getSampleSubmissions'
        ) {
          return part;
        }
        if (mi === mostRecent.msgIdx && pi === mostRecent.partIdx) {
          return part;
        }
        const trp = part as { output: unknown };
        const textValue = extractTextFromToolResultOutput(trp.output);
        return {
          ...(part as object),
          output: {
            type: 'text',
            value:
              textValue +
              '\n[image attachments from this older getSampleSubmissions call were elided to save tokens]',
          },
        };
      }),
    } as ModelMessage;
  });
}

async function renderQuestionAndAnswer(
  context: Pick<AiGradingAgentContext, 'assessmentQuestion' | 'course' | 'question' | 'urlPrefix'>,
): Promise<{ question_html: string; answer_html: string; errors: string[] }> {
  const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: context.assessmentQuestion.id,
  });

  const questionCourse = await getQuestionCourse(context.question, context.course);
  const questionModule = questionServers.getModule(context.question.type);

  const errors: string[] = [];
  for (const instanceQuestion of instanceQuestions) {
    try {
      const { variant } = await selectLastVariantAndSubmission(instanceQuestion.id);
      const locals = {
        ...buildQuestionUrls(context.urlPrefix, variant, context.question, instanceQuestion),
        urlPrefix: context.urlPrefix,
        showCorrectAnswer: false,
        allowAnswerEditing: false,
        questionRenderContext: 'ai_grading' as const,
      };
      const result = await questionModule.render({
        renderSelection: { question: true, submissions: false, answer: true },
        variant,
        question: context.question,
        submission: null,
        submissions: [],
        course: questionCourse,
        locals,
      });
      return {
        question_html: result.data.questionHtml,
        answer_html: result.data.answerHtml,
        errors,
      };
    } catch (err) {
      errors.push(
        `instance_question_id=${instanceQuestion.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
  }

  return { question_html: '', answer_html: '', errors };
}

async function renderSampleSubmissions(
  context: Pick<AiGradingAgentContext, 'assessmentQuestion' | 'course' | 'question' | 'urlPrefix'>,
  count = 5,
): Promise<{ submissions: RenderedSampleSubmission[]; errors: string[] }> {
  const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: context.assessmentQuestion.id,
  });
  const sampled = [...instanceQuestions].sort(() => Math.random() - 0.5).slice(0, count);

  const questionCourse = await getQuestionCourse(context.question, context.course);
  const questionModule = questionServers.getModule(context.question.type);

  const submissions: RenderedSampleSubmission[] = [];
  const errors: string[] = [];
  for (const instanceQuestion of sampled) {
    try {
      const { variant, submission } = await selectLastVariantAndSubmission(instanceQuestion.id);
      const locals = {
        ...buildQuestionUrls(context.urlPrefix, variant, context.question, instanceQuestion),
        urlPrefix: context.urlPrefix,
        showCorrectAnswer: false,
        allowAnswerEditing: false,
        questionRenderContext: 'ai_grading' as const,
      };
      const result = await questionModule.render({
        renderSelection: { question: false, submissions: true, answer: false },
        variant,
        question: context.question,
        submission,
        submissions: [submission],
        course: questionCourse,
        locals,
      });
      submissions.push({
        instance_question_id: instanceQuestion.id,
        submission_message: generateSubmissionMessage({
          submission_text: result.data.submissionHtmls[0] ?? '',
          submitted_answer: submission.submitted_answer,
        }),
      });
    } catch (err) {
      errors.push(
        `instance_question_id=${instanceQuestion.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
  }
  return { submissions, errors };
}

async function getInitializationContext(
  context: Pick<AiGradingAgentContext, 'assessmentQuestion' | 'course' | 'question' | 'urlPrefix'>,
): Promise<{
  question_html: string;
  answer_html: string;
  sample_submissions: RenderedSampleSubmission[];
  current_rubric: unknown;
  question_render_errors: string[];
  submission_render_errors: string[];
}> {
  const {
    question_html,
    answer_html,
    errors: question_render_errors,
  } = await renderQuestionAndAnswer(context);
  const { submissions: sample_submissions, errors: submission_render_errors } =
    await renderSampleSubmissions(context);

  const rubricData = await manualGrading.selectRubricData({
    assessment_question: context.assessmentQuestion,
  });

  return {
    question_html,
    answer_html,
    sample_submissions,
    current_rubric: rubricData,
    question_render_errors,
    submission_render_errors,
  };
}

// ---------------------------------------------------------------------------
// Message persistence helpers
// ---------------------------------------------------------------------------

async function insertUserMessage({
  assessmentQuestionId,
  authnUserId,
  phase,
  text,
  workflowRunId,
  rubricSnapshot,
}: {
  assessmentQuestionId: string;
  authnUserId: string;
  phase: 'generate' | 'edit';
  text: string;
  workflowRunId?: string | null;
  rubricSnapshot?: DiffRubricState | null;
}) {
  return await queryRow(
    sql.insert_user_message,
    {
      assessment_question_id: assessmentQuestionId,
      authn_user_id: authnUserId,
      phase,
      parts: JSON.stringify([{ type: 'text', text }]),
      workflow_run_id: workflowRunId ?? null,
      rubric_snapshot: rubricSnapshot ? JSON.stringify(rubricSnapshot) : null,
    },
    z.object({ id: z.string() }),
  );
}

async function insertInitialAssistantMessage({
  assessmentQuestionId,
  phase,
  modelId,
  workflowRunId,
}: {
  assessmentQuestionId: string;
  phase: 'generate' | 'edit';
  modelId: string;
  workflowRunId?: string | null;
}) {
  return await queryRow(
    sql.insert_initial_assistant_message,
    {
      assessment_question_id: assessmentQuestionId,
      phase,
      model: modelId,
      workflow_run_id: workflowRunId ?? null,
    },
    AiGradingMessageSchema,
  );
}

export async function finalizeAssistantMessage({
  messageId,
  status,
  parts,
  modelId,
  usage,
  rubricSnapshot,
}: {
  messageId: string;
  status: 'completed' | 'errored' | 'canceled';
  parts: unknown[];
  modelId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  rubricSnapshot?: DiffRubricState | null;
}) {
  await execute(sql.finalize_assistant_message, {
    id: messageId,
    status,
    parts: JSON.stringify(parts),
    model: modelId,
    usage_input_tokens: usage.inputTokens,
    usage_input_tokens_cache_read: 0,
    usage_input_tokens_cache_write: 0,
    usage_output_tokens: usage.outputTokens,
    usage_output_tokens_reasoning: 0,
    rubric_snapshot: rubricSnapshot ? JSON.stringify(rubricSnapshot) : null,
  });
}

// ---------------------------------------------------------------------------
// ToolLoopAgent creation
// ---------------------------------------------------------------------------

function createMutex() {
  let chain = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn, fn);
      chain = next.then(
        () => {},
        () => {},
      );
      return next;
    },
  };
}

function buildRubricToolsWithExecute({
  context,
  model,
  job,
}: {
  context: AiGradingAgentContext;
  model: LanguageModel;
  job: JobLogger;
}) {
  const rubricMutex = createMutex();
  // Stores image data for each getSampleSubmissions tool call, keyed by
  // toolCallId. `toModelOutput` reads from this to build a multimodal tool
  // result so the model genuinely sees the images (rather than receiving
  // base64 as raw text in the JSON). `prepareStep` later strips images from
  // older tool-result messages to cap context growth.
  const submissionImagesByToolCallId = new Map<string, SubmissionImage[]>();
  return {
    generateRubric: tool({
      ...AI_GRADING_TOOLS.generateRubric,
      execute: async () =>
        rubricMutex.run(async () => {
          job.info('Tool: generateRubric — gathering context and calling inner LLM');

          const beforeSnapshot = await getRubricSnapshot(context);
          const initContext = await getInitializationContext(context);

          const renderErrors = [
            ...initContext.question_render_errors,
            ...initContext.submission_render_errors,
          ];
          if (renderErrors.length > 0) {
            job.error(
              `generateRubric — ${renderErrors.length} render errors: ${renderErrors.join('; ')}`,
            );
          }
          if (!initContext.question_html) {
            return JSON.stringify({
              error:
                'Failed to render the question. Cannot generate a rubric without question content. Tell the user the rubric was NOT generated because the question failed to render, and ask them to verify the question renders correctly.',
              question_render_errors: initContext.question_render_errors,
              submission_render_errors: initContext.submission_render_errors,
            });
          }
          if (initContext.sample_submissions.length === 0) {
            return JSON.stringify({
              error:
                'Failed to render any sample student submissions. Cannot generate a rubric without examples of student work. Tell the user the rubric was NOT generated because no sample submissions could be rendered, and ask them to verify the submissions render correctly.',
              question_render_errors: initContext.question_render_errors,
              submission_render_errors: initContext.submission_render_errors,
            });
          }

          const freshAq = await selectAssessmentQuestionById(context.assessmentQuestion.id);
          const maxManual = freshAq.max_manual_points ?? 0;
          const maxTotal = freshAq.max_points ?? 0;

          const messages: ModelMessage[] = [
            { role: 'system', content: RUBRIC_GENERATION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                'Assessment question point values (fixed, cannot be changed):',
                `  max_points: ${maxTotal}`,
                `  max_manual_points: ${maxManual}`,
                `  max_auto_points: ${freshAq.max_auto_points ?? 0}`,
                '',
                "IMPORTANT: Your rubric's point values must be logically consistent:",
                '- For positive grading (starting_points=0): sum of all positive items should equal the question max points, min_points should be 0.',
                '- For negative grading (starting_points=max): sum of all negative items should bring the score down to min_points (usually 0).',
                `- If replace_auto_points is true, the rubric covers max_points (${maxTotal}). If false, it covers only max_manual_points (${maxManual}).`,
                '- The minimum attainable score must equal min_points.',
                '- The maximum attainable score must equal question max + max_extra_points.',
              ].join('\n'),
            },
            { role: 'user', content: `Question HTML:\n${initContext.question_html}` },
            { role: 'user', content: `Answer HTML:\n${initContext.answer_html}` },
          ];

          for (const sub of initContext.sample_submissions) {
            messages.push(sub.submission_message);
          }

          if (renderErrors.length > 0) {
            messages.push({
              role: 'user',
              content: [
                'Note: some rendering operations failed while gathering context.',
                initContext.question_render_errors.length > 0
                  ? `Question/answer render errors: ${initContext.question_render_errors.join('; ')}`
                  : null,
                initContext.submission_render_errors.length > 0
                  ? `Sample submission render errors: ${initContext.submission_render_errors.join('; ')}`
                  : null,
                'Proceed using only the context that was successfully rendered.',
              ]
                .filter(Boolean)
                .join('\n'),
            });
          }

          if (initContext.current_rubric) {
            messages.push({
              role: 'user',
              content: `The current rubric (if any) is:\n${JSON.stringify(initContext.current_rubric, null, 2)}`,
            });
          }

          const result = await generateObject({
            model,
            schema: RubricOutputSchema,
            messages,
          });

          job.info('Inner LLM generated rubric: ' + JSON.stringify(result.object, null, 2));

          const questionMaxPoints = getQuestionMaxPoints(
            context.assessmentQuestion,
            result.object.replace_auto_points,
          );
          const validation = validateRubricPoints({
            rubricItems: result.object.rubric_items,
            startingPoints: result.object.starting_points,
            minPoints: result.object.min_points,
            maxExtraPoints: result.object.max_extra_points,
            questionMaxPoints,
          });

          if (!validation.valid) {
            job.error(`generateRubric — validation failed: ${JSON.stringify(validation.errors)}`);
            return JSON.stringify({
              error: 'Generated rubric has invalid point values. Please adjust and try again.',
              validation_errors: validation.errors,
              generated_rubric: result.object,
              question_max_points: questionMaxPoints,
            });
          }

          await manualGrading.updateAssessmentQuestionRubric({
            assessment: context.assessment,
            assessment_question_id: context.assessmentQuestion.id,
            use_rubric: true,
            replace_auto_points: result.object.replace_auto_points,
            starting_points: result.object.starting_points,
            min_points: result.object.min_points,
            max_extra_points: result.object.max_extra_points,
            rubric_items: result.object.rubric_items.map((item, idx) => ({
              order: idx,
              points: item.points,
              description: item.description,
              explanation: item.explanation,
              grader_note: item.grader_note,
              always_show_to_students: item.always_show_to_students,
            })),
            tag_for_manual_grading: false,
            grader_guidelines: result.object.grader_guidelines,
            authn_user_id: context.authnUserId,
          });

          const mutationResult = await formatMutationResult(context, beforeSnapshot);
          job.info(`generateRubric — saved rubric state: ${mutationResult}`);
          if (renderErrors.length === 0) {
            return mutationResult;
          }
          const parsed = JSON.parse(mutationResult);
          return JSON.stringify({
            ...parsed,
            render_errors: {
              question_render_errors: initContext.question_render_errors,
              submission_render_errors: initContext.submission_render_errors,
            },
          });
        }),
    }),

    getRubric: tool({
      ...AI_GRADING_TOOLS.getRubric,
      execute: async () => {
        const rubricState = await formatCurrentRubricState(context);
        job.info(`Tool: getRubric — output: ${rubricState}`);
        return rubricState;
      },
    }),

    getRubricItem: tool({
      ...AI_GRADING_TOOLS.getRubricItem,
      execute: async ({ rubric_item_id }) => {
        job.info(`Tool: getRubricItem — input: ${JSON.stringify({ rubric_item_id })}`);
        const rubricData = await getCurrentRubricItems(context);
        if (!rubricData) {
          return JSON.stringify({
            rubric_exists: false,
            message:
              'No rubric has been created yet. Call generateRubric to create one. Do not treat this as an error.',
          });
        }
        const item = rubricData.rubric_items.find((i) => i.rubric_item.id === rubric_item_id);
        if (!item) {
          return JSON.stringify({
            error: `Rubric item with ID ${rubric_item_id} not found.`,
          });
        }
        const idx = rubricData.rubric_items.indexOf(item);
        const result = JSON.stringify(
          {
            rubric_item_id: item.rubric_item.id,
            display_index: idx + 1,
            points: item.rubric_item.points,
            description: item.rubric_item.description,
            explanation: item.rubric_item.explanation,
            grader_note: item.rubric_item.grader_note,
            always_show_to_students: item.rubric_item.always_show_to_students,
          },
          null,
          2,
        );
        job.info(`Tool: getRubricItem — output: ${result}`);
        return result;
      },
    }),

    addRubricItem: tool({
      ...AI_GRADING_TOOLS.addRubricItem,
      execute: async (input) =>
        rubricMutex.run(async () => {
          const {
            points,
            description,
            explanation,
            grader_note,
            always_show_to_students,
            position,
          } = input;
          job.info(`Tool: addRubricItem — input: ${JSON.stringify(input)}`);
          const beforeSnapshot = await getRubricSnapshot(context);
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists. Generate one first.' });
          }
          const items = rubricDataToItems(rubricData);

          const newItem: RubricItemForEdit = {
            order: 0,
            points,
            description,
            explanation: explanation ?? '',
            grader_note: grader_note ?? '',
            always_show_to_students,
          };

          if (position != null && position >= 0 && position < items.length) {
            items.splice(position, 0, newItem);
          } else {
            items.push(newItem);
          }

          await saveRubricItems(context, rubricData, items);

          const result = await formatMutationResult(context, beforeSnapshot);
          job.info(`addRubricItem RESULT: ${result}`);
          return result;
        }),
    }),

    editRubricItem: tool({
      ...AI_GRADING_TOOLS.editRubricItem,
      execute: async (input) =>
        rubricMutex.run(async () => {
          const {
            rubric_item_id,
            points,
            description,
            explanation,
            grader_note,
            always_show_to_students,
          } = input;
          job.info(`Tool: editRubricItem — input: ${JSON.stringify(input)}`);
          const beforeSnapshot = await getRubricSnapshot(context);
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists.' });
          }
          const items = rubricDataToItems(rubricData);
          const item = items.find((i) => i.id === rubric_item_id);
          if (!item) {
            const availableIds = items.map((i) => i.id).join(', ');
            job.error(
              `editRubricItem: item ${rubric_item_id} not found. Available IDs: ${availableIds}`,
            );
            return JSON.stringify({
              error: `Rubric item ${rubric_item_id} not found. Available IDs: ${availableIds}`,
            });
          }

          if (points !== undefined) item.points = points;
          if (description !== undefined) item.description = description;
          if (explanation !== undefined) item.explanation = explanation ?? '';
          if (grader_note !== undefined) item.grader_note = grader_note ?? '';
          if (always_show_to_students !== undefined) {
            item.always_show_to_students = always_show_to_students;
          }

          await saveRubricItems(context, rubricData, items);

          const result = await formatMutationResult(context, beforeSnapshot);
          job.info(`editRubricItem RESULT: ${result}`);
          return result;
        }),
    }),

    deleteRubricItem: tool({
      ...AI_GRADING_TOOLS.deleteRubricItem,
      execute: async (input) =>
        rubricMutex.run(async () => {
          const { rubric_item_id } = input;
          job.info(`Tool: deleteRubricItem — input: ${JSON.stringify(input)}`);
          const beforeSnapshot = await getRubricSnapshot(context);
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists.' });
          }
          const items = rubricDataToItems(rubricData);

          const idx = items.findIndex((i) => i.id === rubric_item_id);
          if (idx === -1) {
            const availableIds = items.map((i) => i.id).join(', ');
            job.error(
              `deleteRubricItem: item ${rubric_item_id} not found. Available IDs: ${availableIds}`,
            );
            return JSON.stringify({
              error: `Rubric item ${rubric_item_id} not found. Available IDs: ${availableIds}`,
            });
          }

          items.splice(idx, 1);
          await saveRubricItems(context, rubricData, items);

          const result = await formatMutationResult(context, beforeSnapshot);
          job.info(`deleteRubricItem RESULT: ${result}`);
          return result;
        }),
    }),

    swapRubricItems: tool({
      ...AI_GRADING_TOOLS.swapRubricItems,
      execute: async (input) =>
        rubricMutex.run(async () => {
          const { rubric_item_id_a, rubric_item_id_b } = input;
          job.info(`Tool: swapRubricItems — input: ${JSON.stringify(input)}`);
          const beforeSnapshot = await getRubricSnapshot(context);
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists.' });
          }
          const items = rubricDataToItems(rubricData);

          const idxA = items.findIndex((i) => i.id === rubric_item_id_a);
          const idxB = items.findIndex((i) => i.id === rubric_item_id_b);
          if (idxA === -1 || idxB === -1) {
            const availableIds = items.map((i) => i.id).join(', ');
            return JSON.stringify({
              error: `One or both rubric items not found. Available IDs: ${availableIds}`,
            });
          }

          [items[idxA], items[idxB]] = [items[idxB], items[idxA]];
          await saveRubricItems(context, rubricData, items);

          const result = await formatMutationResult(context, beforeSnapshot);
          job.info(`swapRubricItems RESULT: ${result}`);
          return result;
        }),
    }),

    editRubricSettings: tool({
      ...AI_GRADING_TOOLS.editRubricSettings,
      execute: async (input) =>
        rubricMutex.run(async () => {
          job.info(`Tool: editRubricSettings — input: ${JSON.stringify(input)}`);
          const beforeSnapshot = await getRubricSnapshot(context);
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists.' });
          }

          const items = rubricDataToItems(rubricData);

          const newReplaceAutoPoints =
            input.replace_auto_points ?? rubricData.rubric.replace_auto_points;
          const newStartingPoints = input.starting_points ?? rubricData.rubric.starting_points;
          const newMinPoints = input.min_points ?? rubricData.rubric.min_points;
          const newMaxExtraPoints = input.max_extra_points ?? rubricData.rubric.max_extra_points;
          const newGraderGuidelines =
            input.grader_guidelines !== undefined
              ? input.grader_guidelines
              : rubricData.rubric.grader_guidelines;

          await manualGrading.updateAssessmentQuestionRubric({
            assessment: context.assessment,
            assessment_question_id: context.assessmentQuestion.id,
            use_rubric: true,
            replace_auto_points: newReplaceAutoPoints,
            starting_points: newStartingPoints,
            min_points: newMinPoints,
            max_extra_points: newMaxExtraPoints,
            rubric_items: items.map((item, idx) => ({
              id: item.id,
              order: idx,
              points: item.points,
              description: item.description,
              explanation: item.explanation ?? '',
              grader_note: item.grader_note ?? '',
              always_show_to_students: item.always_show_to_students,
            })),
            tag_for_manual_grading: false,
            grader_guidelines: newGraderGuidelines,
            authn_user_id: context.authnUserId,
          });

          const result = await formatMutationResult(context, beforeSnapshot);
          job.info(`editRubricSettings RESULT: ${result}`);
          return result;
        }),
    }),

    getAssessmentQuestionPoints: tool({
      ...AI_GRADING_TOOLS.getAssessmentQuestionPoints,
      execute: async () => {
        const freshAq = await selectAssessmentQuestionById(context.assessmentQuestion.id);
        const result = JSON.stringify(
          {
            max_points: freshAq.max_points,
            max_manual_points: freshAq.max_manual_points,
            max_auto_points: freshAq.max_auto_points,
            points_list: freshAq.points_list,
            note: 'These values are fixed by the instructor and cannot be changed. If replace_auto_points is true, the rubric covers max_points. If false, it covers max_manual_points.',
          },
          null,
          2,
        );
        job.info(`Tool: getAssessmentQuestionPoints — output: ${result}`);
        return result;
      },
    }),

    getQuestionContent: tool({
      ...AI_GRADING_TOOLS.getQuestionContent,
      execute: async () => {
        job.info('Tool: getQuestionContent — rendering question and answer');
        const { question_html, answer_html, errors } = await renderQuestionAndAnswer(context);
        const result = JSON.stringify(
          {
            question_html: truncate(question_html, MAX_SUBMISSION_TEXT_CHARS),
            answer_html: truncate(answer_html, MAX_SUBMISSION_TEXT_CHARS),
            errors,
          },
          null,
          2,
        );
        if (errors.length > 0) {
          job.error(
            `Tool: getQuestionContent — ${errors.length} render errors: ${errors.join('; ')}`,
          );
        }
        job.info(`Tool: getQuestionContent — output length: ${result.length}`);
        return result;
      },
    }),

    getSampleSubmissions: tool({
      ...AI_GRADING_TOOLS.getSampleSubmissions,
      execute: async (_input, { toolCallId }) => {
        job.info('Tool: getSampleSubmissions — rendering sample submissions');
        const { submissions, errors } = await renderSampleSubmissions(context, 3);
        const images: SubmissionImage[] = [];
        const submissionSummaries = submissions.map((s) => {
          const parts = extractSubmissionParts(s.submission_message.content);
          const startIndex = images.length;
          for (const img of parts.images) images.push(img);
          return {
            instance_question_id: s.instance_question_id,
            submission_text: parts.text,
            image_count: parts.images.length,
            image_indices: parts.images.map((_, i) => startIndex + i),
          };
        });
        submissionImagesByToolCallId.set(toolCallId, images);
        const result = JSON.stringify(
          {
            submissions: submissionSummaries,
            total_images_attached: images.length,
            errors,
          },
          null,
          2,
        );
        if (errors.length > 0) {
          job.error(
            `Tool: getSampleSubmissions — ${errors.length} render errors: ${errors.join('; ')}`,
          );
        }
        job.info(
          `Tool: getSampleSubmissions — ${submissions.length} submissions, ${images.length} images, ${errors.length} errors, output length: ${result.length}`,
        );
        return result;
      },
      toModelOutput: ({ toolCallId, output }) => {
        const images = submissionImagesByToolCallId.get(toolCallId) ?? [];
        const text = typeof output === 'string' ? output : JSON.stringify(output);
        if (images.length === 0) {
          return { type: 'text', value: text };
        }
        return {
          type: 'content',
          value: [
            { type: 'text', text },
            ...images.map((img) => ({
              type: 'image-data' as const,
              data: img.data,
              mediaType: img.mediaType,
            })),
          ],
        };
      },
    }),

    revertRubric: tool({
      ...AI_GRADING_TOOLS.revertRubric,
      execute: async ({ message_id: messageId }) =>
        rubricMutex.run(async () => {
          job.info(`Tool: revertRubric — message_id: ${messageId}`);

          if (!/^\d+$/.test(messageId)) {
            return JSON.stringify({
              error: `Invalid message_id "${messageId}". Must be a non-negative integer.`,
            });
          }

          const { selectAiGradingMessageById, selectFirstAiGradingMessage } =
            await import('../../models/ai-grading-message.js');

          // message_id "0" means revert to the initial state before any AI changes.
          // Use the rubric_snapshot from the very first message in the conversation.
          const targetMessage =
            messageId === '0'
              ? await selectFirstAiGradingMessage(context.assessmentQuestion.id)
              : await selectAiGradingMessageById(context.assessmentQuestion.id, messageId);

          job.info(
            `Retrieved message: id=${targetMessage?.id ?? 'null'}, role=${targetMessage?.role ?? 'null'}, status=${targetMessage?.status ?? 'null'}, has_rubric_snapshot=${targetMessage?.rubric_snapshot != null}`,
          );

          if (!targetMessage) {
            job.error(`Message ID ${messageId} not found.`);
            return JSON.stringify({
              error: `Message ID ${messageId} not found.`,
            });
          }

          const snapshot = targetMessage.rubric_snapshot as DiffRubricState | null;
          job.info(
            `Snapshot for message ID ${messageId}: ${snapshot ? JSON.stringify(snapshot).slice(0, 200) + '...' : 'NULL'}`,
          );

          if (!snapshot) {
            return JSON.stringify({
              error: `No rubric state recorded for message ID ${messageId}.`,
            });
          }

          const beforeSnapshot = await getRubricSnapshot(context);

          if (!snapshot.settings) {
            // No rubric existed at this point — remove the rubric
            await manualGrading.updateAssessmentQuestionRubric({
              assessment: context.assessment,
              assessment_question_id: context.assessmentQuestion.id,
              use_rubric: false,
              replace_auto_points: false,
              starting_points: 0,
              min_points: 0,
              max_extra_points: 0,
              rubric_items: [],
              tag_for_manual_grading: false,
              grader_guidelines: null,
              authn_user_id: context.authnUserId,
            });
          } else {
            await restoreRubricFromSnapshot({
              assessment: context.assessment,
              assessmentQuestion: context.assessmentQuestion,
              authnUserId: context.authnUserId,
              snapshot,
            });
          }

          const afterSnapshot = await getRubricSnapshot(context);
          job.info(`revertRubric complete — reverted to message ID ${messageId}`);

          return JSON.stringify({ before: beforeSnapshot, after: afterSnapshot });
        }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

function createRubricAgent({
  phase,
  context,
  model,
  workflowRunId: _workflowRunId,
  job,
  messageId,
}: {
  phase: 'generate' | 'edit';
  context: AiGradingAgentContext;
  model: LanguageModel;
  workflowRunId: string | null;
  job: JobLogger;
  messageId: string;
}) {
  const allTools = buildRubricToolsWithExecute({ context, model, job });

  const cancellationState = { wasCanceled: false };

  const checkCancellation = async () => {
    const status = await queryOptionalScalar(
      sql.select_message_status,
      { id: messageId },
      EnumAiQuestionGenerationMessageStatusSchema,
    );
    if (status === 'canceled') {
      cancellationState.wasCanceled = true;
      return true;
    }
    return false;
  };

  const agent = new ToolLoopAgent({
    model,
    instructions:
      phase === 'generate'
        ? RUBRIC_GENERATION_AGENT_SYSTEM_PROMPT
        : RUBRIC_EDITING_AGENT_SYSTEM_PROMPT,
    stopWhen: [stepCountIs(15), checkCancellation],
    prepareStep: async ({ messages }: { messages: ModelMessage[] }) => ({
      activeTools: [
        'generateRubric',
        'getRubric',
        'getRubricItem',
        'addRubricItem',
        'editRubricItem',
        'deleteRubricItem',
        'swapRubricItems',
        'editRubricSettings',
        'getAssessmentQuestionPoints',
        'getQuestionContent',
        'getSampleSubmissions',
        ...(phase === 'edit' ? (['revertRubric'] as const) : []),
      ] as const,
      messages: stripOlderSubmissionImages(messages),
    }),
    tools: allTools,
  });

  return { agent, cancellationState };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function restoreRubricFromSnapshot({
  assessment,
  assessmentQuestion,
  authnUserId,
  snapshot,
}: {
  assessment: Assessment;
  assessmentQuestion: AssessmentQuestion;
  authnUserId: string;
  snapshot: DiffRubricState;
}): Promise<void> {
  if (!snapshot.settings) {
    throw new Error(
      'Cannot restore: snapshot has no settings (rubric did not exist at that point)',
    );
  }
  const settings = snapshot.settings;
  await manualGrading.updateAssessmentQuestionRubric({
    assessment,
    assessment_question_id: assessmentQuestion.id,
    use_rubric: true,
    replace_auto_points: settings.replace_auto_points as boolean,
    starting_points: settings.starting_points as number,
    min_points: settings.min_points as number,
    max_extra_points: settings.max_extra_points as number,
    rubric_items: snapshot.rubric_items.map((item, idx) => ({
      order: idx,
      points: item.points as number,
      description: item.description as string,
      explanation: (item.explanation as string | null) ?? '',
      grader_note: (item.grader_note as string | null) ?? '',
      always_show_to_students: item.always_show_to_students as boolean,
    })),
    tag_for_manual_grading: false,
    grader_guidelines: (settings.grader_guidelines as string | null) ?? null,
    authn_user_id: authnUserId,
  });
}

/**
 * Insert user + assistant messages into DB without creating the agent.
 * Used by the route handler to get the message_id before continuing the workflow.
 */
export async function prepareAgentMessages({
  phase,
  userMessage,
  assessmentQuestionId,
  authnUserId,
  workflowRunId,
}: {
  phase: 'generate' | 'edit';
  userMessage: string;
  assessmentQuestionId: string;
  authnUserId: string;
  workflowRunId: string;
}) {
  const rubricSnapshot = await captureRubricSnapshot(assessmentQuestionId);

  const userMessageRow = await insertUserMessage({
    assessmentQuestionId,
    authnUserId,
    phase,
    text: userMessage,
    workflowRunId,
    rubricSnapshot,
  });

  const { modelId } = getAgenticGradingModel();

  const messageRow = await insertInitialAssistantMessage({
    assessmentQuestionId,
    phase,
    modelId,
    workflowRunId,
  });

  return { messageRow, userMessageId: userMessageRow.id, modelId };
}

export async function generateRubric(
  context: AiGradingAgentContext,
  job: JobLogger,
  workflowRunId: string,
  messageId: string,
) {
  if (!context.hasCourseInstancePermissionEdit) {
    throw new Error('Access denied (must be a student data editor)');
  }

  const { model, modelId } = getAgenticGradingModel();

  const { agent, cancellationState } = createRubricAgent({
    phase: 'generate',
    context,
    model,
    workflowRunId,
    job,
    messageId,
  });

  return { agent, cancellationState, modelId };
}

export async function editRubric(
  context: AiGradingAgentContext,
  instruction: string,
  persistedMessages: AiGradingMessage[],
  job: JobLogger,
  workflowRunId: string,
  messageId: string,
) {
  const { model, modelId } = getAgenticGradingModel();

  const { agent, cancellationState } = createRubricAgent({
    phase: 'edit',
    context,
    model,
    workflowRunId,
    job,
    messageId,
  });

  // Build conversation context from persisted messages
  const messages: ModelMessage[] = [];

  const editMessages = persistedMessages.filter(
    (m) => m.phase === 'edit' && m.status === 'completed' && m.include_in_context,
  );

  if (editMessages.length > 0) {
    messages.push({
      role: 'user',
      content:
        "The following are PAST exchanges between you and the instructor. Use this context to understand the instructor's preferences and maintain consistency.",
    });

    for (const entry of editMessages) {
      messages.push({
        role: entry.role,
        content: getTextFromParts(entry.parts),
      });
    }

    messages.push({
      role: 'user',
      content: '[END OF PAST CONVERSATION HISTORY]',
    });
  }

  // Add current instruction
  messages.push({
    role: 'user',
    content: instruction,
  });

  return { agent, cancellationState, modelId, messages };
}
