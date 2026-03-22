import assert from 'node:assert';

import { createOpenAI } from '@ai-sdk/openai';
import {
  type InferUITools,
  type LanguageModel,
  type ModelMessage,
  ToolLoopAgent,
  type ToolSet,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
  generateObject,
  stepCountIs,
  tool,
} from 'ai';
import z from 'zod';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { resumeWorkflow } from '@prairielearn/workflows';

import { config } from '../../../lib/config.js';
import {
  type AiGradingMessage,
  AiGradingMessageSchema,
  type Assessment,
  type AssessmentQuestion,
  type Course,
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

const AGENTIC_AI_GRADING_MODEL: AiGradingModelId = 'gpt-5.4';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export function getAgenticGradingModel(): { model: LanguageModel; modelId: string } {
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
      description: z.string().max(100),
      explanation: z.string().nullable(),
      grader_note: z.string().nullable(),
      always_show_to_students: z.boolean(),
    }),
  ),
  starting_points: z.coerce.number(),
  replace_auto_points: z.boolean(),
  min_points: z.coerce.number(),
  max_extra_points: z.coerce.number(),
});

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
  startAiGrading: tool({
    description:
      'Start AI grading of student submissions using the current rubric. This triggers the grading workflow.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
  }),
} satisfies ToolSet;

export type AiGradingUIMessageTools = InferUITools<typeof AI_GRADING_TOOLS>;

export type AiGradingUIMessage = UIMessage<
  AiGradingUIMessageMetadata,
  UIDataTypes,
  AiGradingUIMessageTools
>;

export type AiGradingToolUIPart = ToolUIPart<AiGradingUIMessageTools>;

interface AiGradingUIMessageMetadata {
  job_sequence_id?: string;
  status?: 'streaming' | 'completed' | 'errored';
  phase?: 'generate' | 'edit';
  rubric_modified?: boolean;
  workflow_run_id?: string | null;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

export const RUBRIC_GENERATION_SYSTEM_PROMPT = [
  'You are a rubric creation assistant for a course.',
  'Given a batch of student submissions, generate a cohesive rubric based on them.',
  'Questions students received were programmatically generated and randomized. Avoid hardcoding randomized quantities and final solutions.',
  'This rubric should work for any random variant of the question.',
  'Rubric items are binary: full credit or no credit. Account for nuances by creating separate items.',
  'Create comprehensive rubric items that cover the key aspects of the assignment.',
].join(' ');

const RUBRIC_GENERATION_AGENT_SYSTEM_PROMPT = [
  'You are a rubric creation assistant for a course.',
  'You have access to tools to generate and refine rubrics.',
  'Start by calling the generateRubric tool to create an initial rubric from sample submissions.',
  'After generation, you may optionally refine the rubric using surgical editing tools (addRubricItem, editRubricItem, deleteRubricItem, swapRubricItems).',
  'Use getRubric to see the current state of the rubric at any time.',
  'When referring to rubric items, use the rubric_item_id (database ID) from getRubric, not display indices.',
  'Users may refer to items by their display number (1-based), so map those to the correct rubric_item_id.',
  'After generating and optionally refining the rubric, summarize what was created.',
].join(' ');

const RUBRIC_EDITING_AGENT_SYSTEM_PROMPT = [
  'You are a lead teaching assistant for a course.',
  'You help instructors modify rubrics using surgical editing tools.',
  'IMPORTANT: You MUST always start by calling getRubric to see the current rubric state before making any changes.',
  'Use addRubricItem, editRubricItem, deleteRubricItem, and swapRubricItems to make targeted changes.',
  'When the user asks to change multiple items (e.g. "remove all explanations"), call editRubricItem for EACH affected item.',
  'When referring to rubric items, use the rubric_item_id (database ID) from getRubric, not display indices.',
  'Users may refer to items by their display number (1-based), so map those to the correct rubric_item_id.',
  'If the user asks to start AI grading, call the startAiGrading tool.',
  'Rubric items are binary: full credit or no credit. Account for nuances by creating separate items.',
  'Questions students received were programmatically generated and randomized. Avoid hardcoding randomized quantities and final solutions.',
  'After making changes, respond conversationally to explain what you did.',
].join(' ');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiGradingAgentContext {
  assessment: Assessment;
  assessmentQuestion: AssessmentQuestion;
  course: Course;
  question: Question;
  urlPrefix: string;
  authnUserId: string;
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
  return JSON.stringify(
    {
      starting_points: rubricData.rubric.starting_points,
      replace_auto_points: rubricData.rubric.replace_auto_points,
      min_points: rubricData.rubric.min_points,
      max_extra_points: rubricData.rubric.max_extra_points,
      rubric_items: items,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Context gathering (reused from original)
// ---------------------------------------------------------------------------

async function getInitializationContext({
  assessmentQuestion,
  course,
  question,
  urlPrefix,
}: Pick<
  AiGradingAgentContext,
  'assessmentQuestion' | 'course' | 'question' | 'urlPrefix'
>): Promise<{
  question_html: string;
  answer_html: string;
  sample_submissions: RenderedSampleSubmission[];
  current_rubric: unknown;
}> {
  const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
    assessment_question_id: assessmentQuestion.id,
  });
  const sampledInstanceQuestions = [...instanceQuestions]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  const questionCourse = await getQuestionCourse(question, course);
  const questionModule = questionServers.getModule(question.type);

  const sampleSubmissions: RenderedSampleSubmission[] = [];
  let questionHtml = '';
  let answerHtml = '';

  for (const instanceQuestion of sampledInstanceQuestions) {
    try {
      const { variant, submission } = await selectLastVariantAndSubmission(instanceQuestion.id);

      const locals = {
        ...buildQuestionUrls(urlPrefix, variant, question, instanceQuestion),
        questionRenderContext: 'ai_grading' as const,
      };

      if (questionHtml === '' && answerHtml === '') {
        const renderQuestionResult = await questionModule.render({
          renderSelection: { question: true, submissions: false, answer: true },
          variant,
          question,
          submission: null,
          submissions: [],
          course: questionCourse,
          locals,
        });
        questionHtml = renderQuestionResult.data.questionHtml;
        answerHtml = renderQuestionResult.data.answerHtml;
      }

      const renderSubmissionResult = await questionModule.render({
        renderSelection: { question: false, submissions: true, answer: false },
        variant,
        question,
        submission,
        submissions: [submission],
        course: questionCourse,
        locals,
      });

      sampleSubmissions.push({
        instance_question_id: instanceQuestion.id,
        submission_message: generateSubmissionMessage({
          submission_text: renderSubmissionResult.data.submissionHtmls[0] ?? '',
          submitted_answer: submission.submitted_answer,
        }),
      });
    } catch {
      continue;
    }
  }

  const rubricData = await manualGrading.selectRubricData({
    assessment_question: assessmentQuestion,
  });

  return {
    question_html: questionHtml,
    answer_html: answerHtml,
    sample_submissions: sampleSubmissions,
    current_rubric: rubricData,
  };
}

// ---------------------------------------------------------------------------
// Message persistence helpers
// ---------------------------------------------------------------------------

export async function insertUserMessage({
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

export async function insertInitialAssistantMessage({
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

          const initContext = await getInitializationContext(context);

          const messages: ModelMessage[] = [
            { role: 'system', content: RUBRIC_GENERATION_SYSTEM_PROMPT },
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
            grader_guidelines: null,
            authn_user_id: context.authnUserId,
          });

          const savedState = await formatCurrentRubricState(context);
          job.info(`generateRubric — saved rubric state: ${savedState}`);
          return savedState;
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
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists. Generate one first.' });
          }
          const items = rubricDataToItems(rubricData);
          job.info(`addRubricItem BEFORE: ${JSON.stringify(items)}`);

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

          job.info(`addRubricItem AFTER (before save): ${JSON.stringify(items)}`);
          await saveRubricItems(context, rubricData, items);

          const savedState = await formatCurrentRubricState(context);
          job.info(`addRubricItem SAVED STATE: ${savedState}`);
          return savedState;
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

          job.info(`editRubricItem BEFORE: ${JSON.stringify(item)}`);

          if (points !== undefined) item.points = points;
          if (description !== undefined) item.description = description;
          if (explanation !== undefined) item.explanation = explanation ?? '';
          if (grader_note !== undefined) item.grader_note = grader_note ?? '';
          if (always_show_to_students !== undefined) {
            item.always_show_to_students = always_show_to_students;
          }

          job.info(`editRubricItem AFTER (before save): ${JSON.stringify(item)}`);
          job.info(`editRubricItem ALL ITEMS (before save): ${JSON.stringify(items)}`);

          await saveRubricItems(context, rubricData, items);

          const savedState = await formatCurrentRubricState(context);
          job.info(`editRubricItem SAVED STATE: ${savedState}`);
          return savedState;
        }),
    }),

    deleteRubricItem: tool({
      ...AI_GRADING_TOOLS.deleteRubricItem,
      execute: async (input) =>
        rubricMutex.run(async () => {
          const { rubric_item_id } = input;
          job.info(`Tool: deleteRubricItem — input: ${JSON.stringify(input)}`);
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists.' });
          }
          const items = rubricDataToItems(rubricData);
          job.info(`deleteRubricItem BEFORE: ${JSON.stringify(items)}`);

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
          job.info(`deleteRubricItem AFTER (before save): ${JSON.stringify(items)}`);

          await saveRubricItems(context, rubricData, items);

          const savedState = await formatCurrentRubricState(context);
          job.info(`deleteRubricItem SAVED STATE: ${savedState}`);
          return savedState;
        }),
    }),

    swapRubricItems: tool({
      ...AI_GRADING_TOOLS.swapRubricItems,
      execute: async (input) =>
        rubricMutex.run(async () => {
          const { rubric_item_id_a, rubric_item_id_b } = input;
          job.info(`Tool: swapRubricItems — input: ${JSON.stringify(input)}`);
          const rubricData = await getCurrentRubricItems(context);
          if (!rubricData) {
            return JSON.stringify({ error: 'No rubric exists.' });
          }
          const items = rubricDataToItems(rubricData);
          job.info(`swapRubricItems BEFORE: ${JSON.stringify(items)}`);

          const idxA = items.findIndex((i) => i.id === rubric_item_id_a);
          const idxB = items.findIndex((i) => i.id === rubric_item_id_b);
          if (idxA === -1 || idxB === -1) {
            const availableIds = items.map((i) => i.id).join(', ');
            return JSON.stringify({
              error: `One or both rubric items not found. Available IDs: ${availableIds}`,
            });
          }

          [items[idxA], items[idxB]] = [items[idxB], items[idxA]];
          job.info(`swapRubricItems AFTER (before save): ${JSON.stringify(items)}`);

          await saveRubricItems(context, rubricData, items);

          const savedState = await formatCurrentRubricState(context);
          job.info(`swapRubricItems SAVED STATE: ${savedState}`);
          return savedState;
        }),
    }),

    startAiGrading: tool({
      ...AI_GRADING_TOOLS.startAiGrading,
      execute: async () => {
        job.info('Tool: startAiGrading — moving workflow to grading state');
        if (!workflowRunId) {
          return 'Error: no active workflow found. Cannot start AI grading.';
        }

        await resumeWorkflow(workflowRunId, { action: 'start_grading_stub' });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await resumeWorkflow(workflowRunId, { action: 'grading_stub_complete' });

        return 'AI grading has been started and completed.';
      },
    }),
  };
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
