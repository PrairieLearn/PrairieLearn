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
import * as async from 'async';
import mustache from 'mustache';
import z from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { resumeWorkflow } from '@prairielearn/workflows';
import { IdSchema } from '@prairielearn/zod';

import { logResponseUsage } from '../../../lib/ai-util.js';
import { config } from '../../../lib/config.js';
import {
  type AiGradingMessage,
  AiGradingMessageSchema,
  type Assessment,
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  type InstanceQuestion,
  type Question,
} from '../../../lib/db-types.js';
import { generateJobSequenceToken } from '../../../lib/generateJobSequenceToken.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { emitServerJobProgressUpdate } from '../../../lib/serverJobProgressSocket.js';
import { JobItemStatus } from '../../../lib/serverJobProgressSocket.shared.js';
import { selectAssessmentQuestionById } from '../../../models/assessment-question.js';
import { updateCourseInstanceUsagesForAiGradingResponses } from '../../../models/course-instance-usages.js';
import { selectCompleteRubric } from '../../../models/rubrics.js';
import * as questionServers from '../../../question-servers/index.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';
import { selectGradingJobsInfo } from './ai-grading-stats.js';
import {
  addAiGradingCostToIntervalUsage,
  containsImageCapture,
  generatePrompt,
  generateSubmissionMessage,
  getIntervalUsage,
  insertAiGradingJob,
  parseAiRubricItems,
  sanitizeSchemaKey,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';
import type { AIGradingLog, AIGradingLogger } from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const AGENTIC_AI_GRADING_MODEL: AiGradingModelId = 'gpt-5.4';

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

/**
 * Validate that rubric point values are logically consistent with the
 * assessment question's point allocation.
 *
 * Uses raw (unclamped) values: starting_points + all positive items must
 * equal the expected max, and starting_points + all negative items must
 * equal the expected min. This prevents rubrics where items overshoot or
 * undershoot the question's point range even if clamping would hide it.
 */
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

  // Raw scores before clamping — these must match exactly
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

/**
 * Get the effective maximum points for the question that the rubric covers.
 * If replace_auto_points is true, the rubric covers the full max_points.
 * Otherwise it only covers max_manual_points.
 */
function getQuestionMaxPoints(
  assessmentQuestion: AssessmentQuestion,
  replaceAutoPoints: boolean,
): number {
  return replaceAutoPoints
    ? (assessmentQuestion.max_points ?? 0)
    : (assessmentQuestion.max_manual_points ?? 0);
}

// ---------------------------------------------------------------------------
// Tool schemas (separated from execute so types can be inferred for the UI)
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
      'Get a batch of sample student submissions (up to 5). Use this to see how students actually answered the question, which helps inform rubric item creation.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
  }),
  revertRubric: tool({
    description:
      'Deterministically revert the rubric to a previous state. Use this when the user clicks "Revert" on a message. The snapshot JSON is provided in the user message — pass it as the snapshot parameter exactly as given.',
    inputSchema: z.object({
      snapshot: z
        .string()
        .describe(
          'The full rubric snapshot JSON to restore (settings + rubric_items). This is provided in the user revert message.',
        ),
    }),
    outputSchema: z.string(),
  }),
  startAiGrading: tool({
    description:
      'Start AI grading of student submissions using the current rubric. This triggers the grading workflow.',
    inputSchema: z.object({}),
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
  'Use getQuestionContent to see the question prompt and solution. Use getSampleSubmissions to see how students answered.',
  'When referring to rubric items, use the rubric_item_id (database ID) from getRubric, not display indices.',
  'Users may refer to items by their display number (1-based), so map those to the correct rubric_item_id.',
  'IMPORTANT: Rubric point values must be logically consistent. The response from getRubric includes a point_validation section.',
  'For positive grading: min_points should match the minimum attainable score, and question_max_points + max_extra_points should match the maximum attainable score.',
  'For negative grading: starting_points is near the max, items subtract points down to min_points.',
  'You cannot change the assessment question point values — those are fixed by the instructor.',
  'After generating and optionally refining the rubric, briefly summarize your reasoning.',
  'A detailed diff of all rubric changes will be automatically shown to the user after your message, so do NOT list individual item changes — focus on your rationale and any important decisions.',
  'IMPORTANT: All rubric text (descriptions, explanations, grader notes, guidelines) MUST be written entirely in English. Do not use any non-English characters, including Chinese, Japanese, or other non-Latin scripts.',
].join(' ');

const RUBRIC_EDITING_AGENT_SYSTEM_PROMPT = [
  'You are a lead teaching assistant for a course.',
  'You help instructors modify rubrics using surgical editing tools.',
  'IMPORTANT: You MUST always start by calling getRubric to see the current rubric state before making any changes.',
  'Use addRubricItem, editRubricItem, deleteRubricItem, and swapRubricItems to make targeted changes.',
  'Use editRubricSettings to change grader_guidelines (high-level instructions for graders — NOT specific to any item; use rubric item grader_note for item-specific instructions), starting_points, min_points, max_extra_points, or replace_auto_points.',
  'Use getAssessmentQuestionPoints to see the fixed point values set by the instructor.',
  'Use getQuestionContent to see the question prompt and solution. Use getSampleSubmissions to see how students answered.',
  'When the user asks to change multiple items (e.g. "remove all explanations"), call editRubricItem for EACH affected item.',
  'When referring to rubric items, use the rubric_item_id (database ID) from getRubric, not display indices.',
  'Users may refer to items by their display number (1-based), so map those to the correct rubric_item_id.',
  'If the user asks to revert, their message will contain a JSON snapshot. Call the revertRubric tool with that snapshot string exactly as provided.',
  'If the user asks to start AI grading, call the startAiGrading tool.',
  'IMPORTANT: After making changes, check the point_validation in the getRubric response. If there are errors, fix them immediately by adjusting items or settings.',
  'You may temporarily go outside valid point ranges during multi-step edits, but you must correct any validation errors before finishing.',
  'Rubric items are binary: full credit or no credit. Account for nuances by creating separate items.',
  'Questions students received were programmatically generated and randomized. Avoid hardcoding randomized quantities and final solutions.',
  'You cannot change the assessment question point values — those are fixed by the instructor.',
  'After making changes, respond briefly to explain your reasoning.',
  'A detailed diff of all rubric changes will be automatically shown to the user after your message, so do NOT list individual item changes — focus on your rationale and any important decisions.',
  'IMPORTANT: All rubric text (descriptions, explanations, grader notes, guidelines) MUST be written entirely in English. Do not use any non-English characters, including Chinese, Japanese, or other non-Latin scripts.',
].join(' ');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffRubricState {
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
// Rubric read helpers (used by tools)
// ---------------------------------------------------------------------------

async function getCurrentRubricItems(context: AiGradingAgentContext) {
  // Re-fetch from DB to get the latest manual_rubric_id (it may have been
  // set by a prior tool call like generateRubric within the same agent loop).
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
    // Convert null explanation/grader_note to empty string so that the SQL
    // COALESCE($explanation, explanation) actually clears the field instead of
    // preserving the existing value.
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

/**
 * Fetch the current rubric from DB and format it as a JSON string with
 * display_index (1-based, in display order) for the LLM to consume.
 * Includes point validation status.
 */
async function formatCurrentRubricState(context: AiGradingAgentContext): Promise<string> {
  const rubricData = await getCurrentRubricItems(context);
  if (!rubricData) {
    return JSON.stringify({ error: 'No rubric exists.' });
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

/**
 * Returns a lightweight snapshot object (not a string) for use in before/after
 * diffs. The UI parses this from the tool output to render inline diffs.
 */
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

/**
 * Build the mutation tool result: includes the full after-state for the LLM
 * plus `before`/`after` snapshots so the UI can compute diffs.
 */
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
// Context gathering helpers
// ---------------------------------------------------------------------------

/**
 * Render the question prompt and answer HTML for a single variant.
 * Returns the first successfully rendered result.
 */
async function renderQuestionAndAnswer(
  context: Pick<AiGradingAgentContext, 'assessmentQuestion' | 'course' | 'question' | 'urlPrefix'>,
): Promise<{ question_html: string; answer_html: string }> {
  const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: context.assessmentQuestion.id,
  });

  const questionCourse = await getQuestionCourse(context.question, context.course);
  const questionModule = questionServers.getModule(context.question.type);

  for (const instanceQuestion of instanceQuestions) {
    try {
      const { variant } = await selectLastVariantAndSubmission(instanceQuestion.id);
      const locals = {
        ...buildQuestionUrls(context.urlPrefix, variant, context.question, instanceQuestion),
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
      };
    } catch {
      continue;
    }
  }

  return { question_html: '', answer_html: '' };
}

/**
 * Render up to `count` sample student submissions as ModelMessages.
 */
async function renderSampleSubmissions(
  context: Pick<AiGradingAgentContext, 'assessmentQuestion' | 'course' | 'question' | 'urlPrefix'>,
  count = 5,
): Promise<RenderedSampleSubmission[]> {
  const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: context.assessmentQuestion.id,
  });
  const sampled = [...instanceQuestions].sort(() => Math.random() - 0.5).slice(0, count);

  const questionCourse = await getQuestionCourse(context.question, context.course);
  const questionModule = questionServers.getModule(context.question.type);

  const submissions: RenderedSampleSubmission[] = [];
  for (const instanceQuestion of sampled) {
    try {
      const { variant, submission } = await selectLastVariantAndSubmission(instanceQuestion.id);
      const locals = {
        ...buildQuestionUrls(context.urlPrefix, variant, context.question, instanceQuestion),
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
    } catch {
      continue;
    }
  }
  return submissions;
}

/**
 * Gather all initialization context for the inner rubric generation LLM.
 */
async function getInitializationContext(
  context: Pick<AiGradingAgentContext, 'assessmentQuestion' | 'course' | 'question' | 'urlPrefix'>,
): Promise<{
  question_html: string;
  answer_html: string;
  sample_submissions: RenderedSampleSubmission[];
  current_rubric: unknown;
}> {
  const { question_html, answer_html } = await renderQuestionAndAnswer(context);
  const sample_submissions = await renderSampleSubmissions(context);

  const rubricData = await manualGrading.selectRubricData({
    assessment_question: context.assessmentQuestion,
  });

  return {
    question_html,
    answer_html,
    sample_submissions,
    current_rubric: rubricData,
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
}: {
  assessmentQuestionId: string;
  authnUserId: string;
  phase: 'generate' | 'edit';
  text: string;
  workflowRunId?: string | null;
}) {
  await execute(sql.insert_user_message, {
    assessment_question_id: assessmentQuestionId,
    authn_user_id: authnUserId,
    phase,
    parts: JSON.stringify([{ type: 'text', text }]),
    workflow_run_id: workflowRunId ?? null,
  });
}

async function insertInitialAssistantMessage({
  assessmentQuestionId,
  jobSequenceId,
  phase,
  modelId,
  workflowRunId,
}: {
  assessmentQuestionId: string;
  jobSequenceId: string;
  phase: 'generate' | 'edit';
  modelId: string;
  workflowRunId?: string | null;
}) {
  return await queryRow(
    sql.insert_initial_assistant_message,
    {
      assessment_question_id: assessmentQuestionId,
      job_sequence_id: jobSequenceId,
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
}: {
  messageId: string;
  status: 'completed' | 'errored';
  parts: unknown[];
  modelId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
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
  });
}

// ---------------------------------------------------------------------------
// ToolLoopAgent creation
// ---------------------------------------------------------------------------

/**
 * Simple promise-based mutex to serialize rubric mutations.
 * When the LLM issues parallel tool calls in a single step, each
 * read-modify-write cycle must run sequentially to avoid lost updates.
 */
function createMutex() {
  let chain = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn, fn);
      // Keep the chain going regardless of success/failure
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
  workflowRunId,
  job,
}: {
  context: AiGradingAgentContext;
  model: LanguageModel;
  workflowRunId: string | null;
  job: JobLogger;
}) {
  const rubricMutex = createMutex();
  return {
    generateRubric: tool({
      ...AI_GRADING_TOOLS.generateRubric,
      execute: async () =>
        rubricMutex.run(async () => {
          job.info('Tool: generateRubric — gathering context and calling inner LLM');

          const beforeSnapshot = await getRubricSnapshot(context);
          const initContext = await getInitializationContext(context);

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

          // Validate generated rubric before saving
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
          return mutationResult;
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
          return JSON.stringify({ error: 'No rubric exists for this assessment question yet.' });
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
        const { question_html, answer_html } = await renderQuestionAndAnswer(context);
        const result = JSON.stringify({ question_html, answer_html }, null, 2);
        job.info(`Tool: getQuestionContent — output length: ${result.length}`);
        return result;
      },
    }),

    getSampleSubmissions: tool({
      ...AI_GRADING_TOOLS.getSampleSubmissions,
      execute: async () => {
        job.info('Tool: getSampleSubmissions — rendering sample submissions');
        const submissions = await renderSampleSubmissions(context);
        const result = JSON.stringify(
          submissions.map((s) => ({
            instance_question_id: s.instance_question_id,
            submission_content: s.submission_message.content,
          })),
          null,
          2,
        );
        job.info(
          `Tool: getSampleSubmissions — ${submissions.length} submissions, output length: ${result.length}`,
        );
        return result;
      },
    }),

    revertRubric: tool({
      ...AI_GRADING_TOOLS.revertRubric,
      // TODO: This should be a message ID instead of a snapshot.
      // Have the LLM pass in the message ID to revert to. The tool takes care of the rest.
      execute: async ({ snapshot: snapshotJson }) =>
        rubricMutex.run(async () => {
          job.info(`Tool: revertRubric — input snapshot: ${snapshotJson}`);

          const beforeState = await formatCurrentRubricState(context);

          let snapshot: DiffRubricState;
          try {
            snapshot = JSON.parse(snapshotJson) as DiffRubricState;
          } catch {
            return JSON.stringify({ error: 'Invalid snapshot JSON.' });
          }

          if (!snapshot.settings) {
            return JSON.stringify({
              error: 'Snapshot has no settings — cannot restore.',
            });
          }

          await restoreRubricFromSnapshot({
            assessment: context.assessment,
            assessmentQuestion: context.assessmentQuestion,
            authnUserId: context.authnUserId,
            snapshot,
          });

          const afterState = await formatCurrentRubricState(context);
          job.info(`revertRubric SAVED STATE: ${afterState}`);

          return JSON.stringify({
            before: JSON.parse(beforeState),
            after: JSON.parse(afterState),
          });
        }),
    }),

    startAiGrading: tool({
      ...AI_GRADING_TOOLS.startAiGrading,
      execute: async () => {
        job.info('Tool: startAiGrading — starting agentic grading');

        if (workflowRunId) {
          await resumeWorkflow(workflowRunId, { action: 'start_grading' });
        }

        const jobSequenceId = await startAgenticGrading({
          context,
          workflowRunId,
        });

        const jobSequenceToken = generateJobSequenceToken(jobSequenceId);

        return JSON.stringify({
          status: 'grading_started',
          job_sequence_id: jobSequenceId,
          job_sequence_token: jobSequenceToken,
          message: 'AI grading started. Progress is shown below.',
        });
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Agentic grading — per-submission decision + batch orchestration
// ---------------------------------------------------------------------------

const AGENTIC_GRADING_SYSTEM_PROMPT = [
  'You are a lead teaching assistant for a course.',
  'You will be shown a student submission and the current grading rubric.',
  'You have two options:',
  '1. GRADE: If the rubric adequately covers this submission, grade it by selecting which rubric items apply.',
  '2. PROPOSE_RUBRIC_CHANGES: If you notice the rubric is missing important criteria, has ambiguous items, or needs modification based on this submission, propose specific changes.',
  'Your primary goal is NOT just to grade, but to ensure the rubric is robust, clear, comprehensive, and allows for consistent grading by other TAs.',
  'The current rubric is a draft. It may be underspecified.',
  'Questions students received were programmatically generated and randomized. Avoid hardcoding randomized quantities and final solutions.',
  'This rubric should work for any random variant of the question.',
  'Rubric items cannot have partial credit: they are either fully awarded or not awarded at all.',
  'When proposing changes, describe them concisely so the instructor can make a quick decision.',
  'IMPORTANT: All text MUST be written entirely in English.',
].join(' ');

const PARALLEL_AGENTIC_GRADING_LIMIT = 20;

interface AgenticGradingDecision {
  decision: 'grade' | 'propose_rubric_changes';
  explanation: string;
  rubric_items?: Record<string, boolean>;
  proposed_changes?: string;
}

/**
 * Grade a single submission using the agentic decision schema:
 * the AI decides whether to grade or propose rubric changes.
 */
async function gradeOneSubmissionWithDecision({
  instanceQuestion,
  context,
  model,
  modelId,
  jobSequenceId,
  logger,
}: {
  instanceQuestion: InstanceQuestion;
  context: AiGradingAgentContext;
  model: LanguageModel;
  modelId: AiGradingModelId;
  jobSequenceId: string;
  logger: AIGradingLogger;
}): Promise<{ success: boolean; decision: AgenticGradingDecision | null }> {
  const questionCourse = await getQuestionCourse(context.question, context.course);
  const questionModule = questionServers.getModule(context.question.type);

  const { variant, submission } = await selectLastVariantAndSubmission(instanceQuestion.id);

  const locals = {
    ...buildQuestionUrls(context.urlPrefix, variant, context.question, instanceQuestion),
    questionRenderContext: 'ai_grading' as const,
  };

  // Render question + answer
  const renderQuestionResults = await questionModule.render({
    renderSelection: { question: true, submissions: false, answer: true },
    variant,
    question: context.question,
    submission: null,
    submissions: [],
    course: questionCourse,
    locals,
  });
  if (renderQuestionResults.courseIssues.length > 0) {
    logger.error(renderQuestionResults.courseIssues.toString());
    return { success: false, decision: null };
  }
  const questionPrompt = renderQuestionResults.data.questionHtml;
  const questionAnswer = renderQuestionResults.data.answerHtml;

  // Render submission
  const renderSubmissionResults = await questionModule.render({
    renderSelection: { question: false, submissions: true, answer: false },
    variant,
    question: context.question,
    submission,
    submissions: [submission],
    course: questionCourse,
    locals,
  });
  const submissionText = renderSubmissionResults.data.submissionHtmls[0];
  const hasImage = containsImageCapture(submissionText);

  // Get rubric
  const { rubric, rubric_items } = await selectCompleteRubric(context.assessmentQuestion.id);

  // Render mustache templates in rubric items
  const mustacheParams = {
    correct_answers: submission.true_answer ?? {},
    params: submission.params ?? {},
    submitted_answers: submission.submitted_answer,
  };
  for (const rubricItem of rubric_items) {
    rubricItem.description = mustache.render(rubricItem.description, mustacheParams);
    rubricItem.explanation = rubricItem.explanation
      ? mustache.render(rubricItem.explanation, mustacheParams)
      : null;
    rubricItem.grader_note = rubricItem.grader_note
      ? mustache.render(rubricItem.grader_note, mustacheParams)
      : null;
  }

  // Build the prompt using existing infrastructure
  const input = await generatePrompt({
    questionPrompt,
    questionAnswer,
    submission_text: submissionText,
    submitted_answer: submission.submitted_answer,
    rubric_items,
    grader_guidelines: rubric?.grader_guidelines ?? null,
    params: variant.params ?? {},
    true_answer: variant.true_answer ?? {},
    model_id: modelId,
  });

  // Add agentic system prompt
  input.unshift({
    role: 'system',
    content: AGENTIC_GRADING_SYSTEM_PROMPT,
  });

  // Build dynamic rubric items schema (same pattern as ai-grading.ts).
  // Sanitize descriptions for use as JSON schema property keys since
  // structured output APIs reject certain characters (quotes, backslashes).
  let RubricGradingItemsSchema = z.object({}) as z.ZodObject<Record<string, z.ZodBoolean>>;
  for (const item of rubric_items) {
    RubricGradingItemsSchema = RubricGradingItemsSchema.merge(
      z.object({
        [sanitizeSchemaKey(item.description)]: z.boolean(),
      }),
    );
  }

  const explanationDescription = run(() => {
    const parts = ['Instructor-facing explanation of the grading decision.'];
    if (hasImage) {
      parts.push(
        'You MUST include a complete transcription of all relevant text, numbers, and information from any images the student submitted.',
        'You MUST transcribe the final answer(s) from the images.',
        'You MUST use LaTeX formatting for mathematical expressions, equations, and formulas.',
        'You MUST wrap inline LaTeX in dollar signs ($).',
        'You MUST wrap block LaTeX in double dollar signs ($$).',
      );
    }
    return parts.join(' ');
  });

  // Decision schema: grade OR propose_rubric_changes
  // OpenAI strict mode requires ALL properties in `required` and does not
  // support nullable ZodObjects correctly. So we always require rubric_items
  // and proposed_changes. When decision is "grade", proposed_changes should
  // be an empty string. When decision is "propose_rubric_changes", all
  // rubric items should be set to false.
  const DecisionSchema = z.object({
    decision: z.enum(['grade', 'propose_rubric_changes']),
    explanation: z.string().describe(explanationDescription),
    rubric_items: RubricGradingItemsSchema.describe(
      'When decision is "grade", mark each rubric item as true/false. When decision is "propose_rubric_changes", set all items to false.',
    ),
    proposed_changes: z
      .string()
      .describe(
        'When decision is "propose_rubric_changes", describe the proposed changes. When decision is "grade", set to an empty string.',
      ),
  });

  const response = await generateObject({
    model,
    schema: DecisionSchema,
    messages: input,
  });

  logResponseUsage({ response, logger });

  // Track cost
  const trackRateLimitAndCost = !context.courseInstance.ai_grading_use_custom_api_keys;
  if (trackRateLimitAndCost) {
    await addAiGradingCostToIntervalUsage({
      courseInstance: context.courseInstance,
      model: modelId,
      usage: response.usage,
    });
  }

  const result = response.object;
  logger.info(`Decision for IQ ${instanceQuestion.id}: ${result.decision}`);

  if (result.decision === 'propose_rubric_changes') {
    return {
      success: true,
      decision: {
        decision: 'propose_rubric_changes',
        explanation: result.explanation,
        proposed_changes: result.proposed_changes,
      },
    };
  }

  // decision === 'grade' — save the grading result
  logger.info(`Parsed response: ${JSON.stringify(result, null, 2)}`);
  const { appliedRubricItems, appliedRubricDescription } = parseAiRubricItems({
    ai_rubric_items: result.rubric_items,
    rubric_items,
  });

  // Check if this IQ needs score update (same logic as ai-grading.ts)
  const allInstanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: context.assessmentQuestion.id,
  });
  const instanceQuestionGradingJobs = await selectGradingJobsInfo(allInstanceQuestions);
  const shouldUpdateScore = !instanceQuestionGradingJobs[instanceQuestion.id].some(
    (job) => job.grading_method === 'Manual',
  );

  if (shouldUpdateScore && rubric_items.length > 0) {
    const manualRubricData = {
      rubric_id: rubric_items[0].rubric_id,
      applied_rubric_items: appliedRubricItems,
    };
    await runInTransactionAsync(async () => {
      const { grading_job_id } = await manualGrading.updateInstanceQuestionScore({
        assessment: context.assessment,
        instance_question_id: instanceQuestion.id,
        submission_id: submission.id,
        check_modified_at: null,
        score: {
          manual_rubric_data: manualRubricData,
          feedback: { manual: '' },
        },
        authn_user_id: context.userId,
        is_ai_graded: true,
      });
      assert(grading_job_id);

      await insertAiGradingJob({
        grading_job_id,
        job_sequence_id: jobSequenceId,
        model_id: modelId,
        prompt: input,
        course_id: context.course.id,
        course_instance_id: context.courseInstance.id,
        response,
      });

      await updateCourseInstanceUsagesForAiGradingResponses({
        courseInstanceId: context.courseInstance.id,
        authnUserId: context.authnUserId,
        model: modelId,
        finalGradingResponse: response,
      });
    });
  } else if (rubric_items.length > 0) {
    await runInTransactionAsync(async () => {
      assert(context.assessmentQuestion.max_manual_points);
      const manualRubricGrading = await manualGrading.insertRubricGrading(
        rubric_items[0].rubric_id,
        context.assessmentQuestion.max_points ?? 0,
        context.assessmentQuestion.max_manual_points,
        appliedRubricItems,
        0,
      );
      const score =
        manualRubricGrading.computed_points / context.assessmentQuestion.max_manual_points;
      const gradingJobId = await queryScalar(
        sql.insert_grading_job,
        {
          submission_id: submission.id,
          authn_user_id: context.userId,
          grading_method: 'AI',
          correct: null,
          score,
          auto_points: 0,
          manual_points: manualRubricGrading.computed_points,
          manual_rubric_grading_id: manualRubricGrading.id,
          feedback: null,
        },
        IdSchema,
      );

      await insertAiGradingJob({
        grading_job_id: gradingJobId,
        job_sequence_id: jobSequenceId,
        model_id: modelId,
        prompt: input,
        course_id: context.course.id,
        course_instance_id: context.courseInstance.id,
        response,
      });

      await updateCourseInstanceUsagesForAiGradingResponses({
        courseInstanceId: context.courseInstance.id,
        authnUserId: context.authnUserId,
        model: modelId,
        finalGradingResponse: response,
      });
    });
  }

  for (const item of appliedRubricDescription) {
    logger.info(`- ${item}`);
  }

  return {
    success: true,
    decision: {
      decision: 'grade',
      explanation: result.explanation,
      rubric_items: result.rubric_items,
    },
  };
}

/**
 * Start agentic AI grading: processes submissions in dynamically-sized batches.
 * Returns the job sequence ID for progress tracking.
 */
export async function startAgenticGrading({
  context,
  workflowRunId,
}: {
  context: AiGradingAgentContext;
  workflowRunId: string | null;
}): Promise<string> {
  if (!context.assessmentQuestion.max_manual_points) {
    throw new Error(
      'AI grading is only available on assessment questions that use manual grading.',
    );
  }

  const { model, modelId } = getAgenticGradingModel();

  const serverJob = await createServerJob({
    type: 'ai_grading',
    description: 'Agentic AI grading',
    userId: context.userId,
    authnUserId: context.authnUserId,
    courseId: context.course.id,
    courseInstanceId: context.courseInstance.id,
    assessmentId: context.assessment.id,
    assessmentQuestionId: context.assessmentQuestion.id,
  });

  const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: context.assessmentQuestion.id,
  });

  let itemStatuses = instanceQuestions.reduce(
    (acc, iq) => {
      acc[iq.id] = JobItemStatus.queued;
      return acc;
    },
    {} as Record<string, JobItemStatus>,
  );

  await emitServerJobProgressUpdate({
    job_sequence_id: serverJob.jobSequenceId,
    num_complete: 0,
    num_failed: 0,
    num_total: instanceQuestions.length,
    item_statuses: itemStatuses,
  });

  serverJob.executeInBackground(async (job) => {
    const trackRateLimitAndCost = !context.courseInstance.ai_grading_use_custom_api_keys;
    let rateLimitExceeded =
      trackRateLimitAndCost &&
      (await getIntervalUsage(context.courseInstance)) > config.aiGradingRateLimitDollars;

    if (rateLimitExceeded) {
      job.error("You've reached the hourly usage cap for AI grading. Please try again later.");
      itemStatuses = instanceQuestions.reduce(
        (acc, iq) => {
          acc[iq.id] = JobItemStatus.failed;
          return acc;
        },
        {} as Record<string, JobItemStatus>,
      );
      await emitServerJobProgressUpdate({
        job_sequence_id: serverJob.jobSequenceId,
        num_complete: instanceQuestions.length,
        num_failed: instanceQuestions.length,
        num_total: instanceQuestions.length,
        job_failure_message: 'Hourly usage cap reached. Try again later.',
        item_statuses: itemStatuses,
      });
      return;
    }

    job.info(`Using model ${modelId} for agentic AI grading.`);
    job.info(`Found ${instanceQuestions.length} submissions to grade!`);

    let numComplete = 0;
    let numFailed = 0;
    let batchSize = 1;
    let consecutiveNoProposals = 0;
    let batchStart = 0;
    const allProposals: string[] = [];

    while (batchStart < instanceQuestions.length) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated in async callback
      if (rateLimitExceeded) break;

      const batchEnd = Math.min(batchStart + batchSize, instanceQuestions.length);
      const batch = instanceQuestions.slice(batchStart, batchEnd);
      let batchHadProposals = false;

      job.info(
        `Batch: processing submissions ${batchStart + 1} to ${batchEnd} (batch size: ${batchSize})`,
      );

      await async.mapLimit(batch, batchSize, async (iq: InstanceQuestion) => {
        if (rateLimitExceeded) {
          itemStatuses[iq.id] = JobItemStatus.failed;
          numFailed++;
          return;
        }

        // Check rate limit
        if (
          trackRateLimitAndCost &&
          (await getIntervalUsage(context.courseInstance)) > config.aiGradingRateLimitDollars
        ) {
          rateLimitExceeded = true;
          itemStatuses[iq.id] = JobItemStatus.failed;
          numFailed++;
          return;
        }

        const logs: AIGradingLog[] = [];
        const logger: AIGradingLogger = {
          info: (msg: string) => logs.push({ messageType: 'info', message: msg }),
          error: (msg: string) => logs.push({ messageType: 'error', message: msg }),
        };

        try {
          itemStatuses[iq.id] = JobItemStatus.in_progress;
          await emitServerJobProgressUpdate({
            job_sequence_id: serverJob.jobSequenceId,
            num_complete: numComplete,
            num_failed: numFailed,
            num_total: instanceQuestions.length,
            item_statuses: itemStatuses,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated in async callback
            job_failure_message: rateLimitExceeded
              ? 'Hourly usage cap reached. Try again later.'
              : undefined,
          });

          const result = await gradeOneSubmissionWithDecision({
            instanceQuestion: iq,
            context,
            model,
            modelId,
            jobSequenceId: serverJob.jobSequenceId,
            logger,
          });

          if (result.success) {
            itemStatuses[iq.id] = JobItemStatus.complete;
            if (result.decision?.decision === 'propose_rubric_changes') {
              batchHadProposals = true;
              allProposals.push(
                `Submission ${iq.id}: ${result.decision.explanation}\n${result.decision.proposed_changes}`,
              );
            }
          } else {
            itemStatuses[iq.id] = JobItemStatus.failed;
            numFailed++;
          }
        } catch (err: unknown) {
          logger.error(String(err));
          itemStatuses[iq.id] = JobItemStatus.failed;
          numFailed++;
        } finally {
          numComplete++;
          await emitServerJobProgressUpdate({
            job_sequence_id: serverJob.jobSequenceId,
            num_complete: numComplete,
            num_failed: numFailed,
            num_total: instanceQuestions.length,
            item_statuses: itemStatuses,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated in async callback
            job_failure_message: rateLimitExceeded
              ? 'Hourly usage cap reached. Try again later.'
              : undefined,
          });
          for (const log of logs) {
            if (log.messageType === 'info') {
              job.info(log.message);
            } else {
              job.error(log.message);
            }
          }
        }
      });

      // Dynamic batch sizing
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated in async callback
      if (batchHadProposals) {
        consecutiveNoProposals = 0;
      } else {
        consecutiveNoProposals++;
        if (consecutiveNoProposals >= 3 && batchSize < PARALLEL_AGENTIC_GRADING_LIMIT) {
          batchSize = Math.min(batchSize * 2, PARALLEL_AGENTIC_GRADING_LIMIT);
          consecutiveNoProposals = 0;
          job.info(`Increasing batch size to ${batchSize}`);
        }
      }

      batchStart = batchEnd;
    }

    if (numFailed > 0) {
      job.error(`\nNumber of errors: ${numFailed}`);
      job.fail('Errors occurred while AI grading, see output for details');
    }

    if (allProposals.length > 0) {
      job.info('\n--- Rubric Change Proposals ---');
      for (const proposal of allProposals) {
        job.info(proposal);
      }
    }

    // Transition workflow back to rubric editing
    if (workflowRunId) {
      await resumeWorkflow(workflowRunId, { action: 'grading_complete' });
    }
  });

  return serverJob.jobSequenceId;
}

export function createRubricAgent({
  phase,
  context,
  model,
  workflowRunId,
  job,
}: {
  phase: 'generate' | 'edit';
  context: AiGradingAgentContext;
  model: LanguageModel;
  workflowRunId: string | null;
  job: JobLogger;
}) {
  const allTools = buildRubricToolsWithExecute({ context, model, workflowRunId, job });

  const agent = new ToolLoopAgent({
    model,
    instructions:
      phase === 'generate'
        ? RUBRIC_GENERATION_AGENT_SYSTEM_PROMPT
        : RUBRIC_EDITING_AGENT_SYSTEM_PROMPT,
    stopWhen: [stepCountIs(15)],
    prepareStep: async () => {
      if (phase === 'generate') {
        return {
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
          ] as const,
        };
      } else {
        return {
          activeTools: [
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
            'revertRubric',
            'startAiGrading',
          ] as const,
        };
      }
    },
    tools: allTools,
  });

  return agent;
}

// ---------------------------------------------------------------------------
// Public API — called by route handler
// ---------------------------------------------------------------------------

/**
 * Restore the rubric to a previous snapshot state. Used by the "Revert"
 * button in the chat UI to deterministically restore the rubric to the
 * state before a particular message's changes.
 */
export async function restoreRubricFromSnapshot({
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

export async function generateRubric(
  context: AiGradingAgentContext,
  job: JobLogger,
  jobSequenceId: string,
  workflowRunId?: string | null,
) {
  if (!context.hasCourseInstancePermissionEdit) {
    throw new Error('Access denied (must be a student data editor)');
  }

  await insertUserMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    authnUserId: context.authnUserId,
    phase: 'generate',
    text: 'Generate a new rubric.',
    workflowRunId,
  });

  const { model, modelId } = getAgenticGradingModel();

  const messageRow = await insertInitialAssistantMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    jobSequenceId,
    phase: 'generate',
    modelId,
    workflowRunId,
  });

  const agent = createRubricAgent({
    phase: 'generate',
    context,
    model,
    workflowRunId: workflowRunId ?? null,
    job,
  });

  return { agent, messageRow, modelId };
}

export async function editRubric(
  context: AiGradingAgentContext,
  instruction: string,
  persistedMessages: AiGradingMessage[],
  job: JobLogger,
  jobSequenceId: string,
  workflowRunId?: string | null,
) {
  await insertUserMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    authnUserId: context.authnUserId,
    phase: 'edit',
    text: instruction,
    workflowRunId,
  });

  const { model, modelId } = getAgenticGradingModel();

  const messageRow = await insertInitialAssistantMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    jobSequenceId,
    phase: 'edit',
    modelId,
    workflowRunId,
  });

  const agent = createRubricAgent({
    phase: 'edit',
    context,
    model,
    workflowRunId: workflowRunId ?? null,
    job,
  });

  // Build conversation context messages for the agent
  const messages: ModelMessage[] = [];

  // Build conversation history from persisted edit-phase messages
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

  return { agent, messageRow, modelId, messages };
}
