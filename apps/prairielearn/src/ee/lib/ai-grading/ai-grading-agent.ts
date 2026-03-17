import assert from 'node:assert';

import { createOpenAI } from '@ai-sdk/openai';
import { type LanguageModel, type ModelMessage, ToolLoopAgent, stepCountIs, tool } from 'ai';
import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { config } from '../../../lib/config.js';
import type { Assessment, AssessmentQuestion, Course, Question } from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { type RubricData, RubricDataSchema } from '../../../lib/manualGrading.types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import * as questionServers from '../../../question-servers/index.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';
import {
  generateSubmissionMessage,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';

const AGENTIC_AI_GRADING_MODEL: AiGradingModelId = 'gpt-5-mini-2025-08-07';
export const AI_GRADING_AGENT_INSTRUCTIONS =
  'You are a lead teaching assistant working on rubric design in PrairieLearn. ' +
  'Only start rubric-generation tools after the user explicitly asks to begin rubric generation. ' +
  'When rubric generation is started, you must do exactly two tool calls in this order: ' +
  '(1) get_initialization_context, then (2) set_rubric. ' +
  'Do not call set_rubric before get_initialization_context. ' +
  'After rubric generation is complete, when the user asks for rubric edits, first call get_rubric_items and then call propose_* rubric tools to stage concrete changes. ' +
  'Do not only describe edits in text; use tools to stage them. ' +
  'Questions are randomized, so rubric items must be robust across random variants and must not hardcode numeric values. ' +
  'Rubric items must be clear for consistent grading by different graders. ' +
  'Rubric items cannot rely on partial-credit wording.';

export function getAgenticGradingModel(): { model: LanguageModel; modelId: string } {
  assert(config.aiGradingOpenAiApiKey, 'AI grading OpenAI API key is not configured');
  const openai = createOpenAI({
    apiKey: config.aiGradingOpenAiApiKey,
    organization: config.aiGradingOpenAiOrganization ?? undefined,
  });
  const modelId = AGENTIC_AI_GRADING_MODEL;
  return { model: openai(modelId), modelId };
}

const ToolRubricItemSchema = z.object({
  id: z
    .union([IdSchema, z.string(), z.null()])
    .optional()
    .transform((id) => {
      if (id == null) {
        return undefined;
      }
      const parsedId = IdSchema.safeParse(id);
      return parsedId.success ? parsedId.data : undefined;
    }),
  order: z.coerce.number(),
  points: z.coerce.number(),
  description: z.string().max(100),
  explanation: z.string().nullable().optional().default(null),
  grader_note: z.string().nullable().optional().default(null),
  always_show_to_students: z.boolean().optional().default(false),
});

const SetRubricInputSchema = z.object({
  use_rubric: z.boolean(),
  replace_auto_points: z.boolean(),
  starting_points: z.coerce.number(),
  min_points: z.coerce.number(),
  max_extra_points: z.coerce.number(),
  rubric_items: z.array(ToolRubricItemSchema),
  tag_for_manual_grading: z.boolean().default(false),
  grader_guidelines: z.string().nullable().default(null),
});

const ProposeAddRubricItemInputSchema = z.object({
  points: z.coerce.number(),
  description: z.string().max(100),
  explanation: z.string().nullable().optional().default(null),
  grader_note: z.string().nullable().optional().default(null),
  always_show_to_students: z.boolean().optional().default(true),
});

const ProposeEditRubricItemInputSchema = z.object({
  target_rubric_item_id: IdSchema.optional(),
  target_rubric_item_number: z.coerce.number().optional(),
  points: z.coerce.number().optional(),
  description: z.string().max(100).optional(),
  explanation: z.string().nullable().optional(),
  grader_note: z.string().nullable().optional(),
  always_show_to_students: z.boolean().optional(),
});

const ProposeDeleteRubricItemInputSchema = z.object({
  target_rubric_item_id: IdSchema.optional(),
  target_rubric_item_number: z.coerce.number().optional(),
});

const RubricDiffSchema = z.object({
  status: z.enum(['new', 'updated', 'removed']),
  changed_fields: z.array(
    z.enum(['points', 'description', 'explanation', 'grader_note', 'always_show_to_students']),
  ),
  description: z.string(),
});

const ProposalToolOutputSchema = z.object({
  message: z.string(),
  proposed_rubric: z.unknown(),
  proposed_rubric_item_diffs: z.record(z.string(), RubricDiffSchema),
});

const GetRubricItemsOutputSchema = z.object({
  rubric_items: z.array(
    z.object({
      row_index: z.number(),
      rubric_item_id: z.string(),
      rubric_item_number: z.number(),
      points: z.number(),
      description: z.string(),
      explanation: z.string().nullable(),
      grader_note: z.string().nullable(),
      always_show_to_students: z.boolean(),
      pending_status: z.enum(['none', 'new', 'updated', 'removed']),
      pending_changed_fields: z.array(
        z.enum(['points', 'description', 'explanation', 'grader_note', 'always_show_to_students']),
      ),
    }),
  ),
});

interface AiGradingAgentContext {
  assessment: Assessment;
  assessmentQuestion: AssessmentQuestion;
  course: Course;
  question: Question;
  urlPrefix: string;
  authnUserId: string;
  hasCourseInstancePermissionEdit: boolean;
  rubricGenerationCompleted: boolean;
  stagedRubricData: unknown;
  stagedRubricItemDiffs: unknown;
}

interface RenderedSampleSubmission {
  instance_question_id: string;
  submission_message: ModelMessage;
}

type RubricDiffStatus = 'new' | 'updated' | 'removed';
type RubricDiffField =
  | 'points'
  | 'description'
  | 'explanation'
  | 'grader_note'
  | 'always_show_to_students';

interface RubricItemDiff {
  status: RubricDiffStatus;
  changed_fields: RubricDiffField[];
  description: string;
}

function getMessageText(message: ModelMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter((text) => text.length > 0)
    .join(' ');
}

function userStartedRubricGeneration(messages: ModelMessage[]): boolean {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUserMessage) {
    return false;
  }

  const text = getMessageText(latestUserMessage).toLowerCase();
  if (text.includes('begin_rubric_generation')) {
    return true;
  }

  return (
    text.includes('rubric') &&
    (text.includes('generate') ||
      text.includes('create') ||
      text.includes('start') ||
      text.includes('build'))
  );
}

function userRequestedRubricChanges(messages: ModelMessage[]): boolean {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUserMessage) {
    return false;
  }

  const text = getMessageText(latestUserMessage).toLowerCase();
  if (text.includes('start ai grading')) {
    return false;
  }

  return [
    'merge',
    'combine',
    'add',
    'edit',
    'update',
    'change',
    'revise',
    'modify',
    'remove',
    'delete',
    'replace',
    'rewrite',
    'split',
    'reorder',
  ].some((keyword) => text.includes(keyword));
}

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
    sample_submissions: [], //sampleSubmissions,
    current_rubric: rubricData,
  };
}

function parseRubricItemDiffs(rawDiffs: unknown): Partial<Record<number, RubricItemDiff>> {
  if (typeof rawDiffs !== 'object' || rawDiffs == null) {
    return {};
  }

  const parsedDiffs: Partial<Record<number, RubricItemDiff>> = {};
  for (const [rawIndex, rawDiff] of Object.entries(rawDiffs)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) continue;
    const parsedDiff = RubricDiffSchema.safeParse(rawDiff);
    if (!parsedDiff.success) continue;
    parsedDiffs[index] = parsedDiff.data;
  }
  return parsedDiffs;
}

function stringifyRubricItemDiffs(
  diffs: Partial<Record<number, RubricItemDiff>>,
): Record<string, RubricItemDiff> {
  return Object.fromEntries(
    Object.entries(diffs).flatMap(([index, diff]) =>
      diff == null ? [] : [[String(index), diff] as const],
    ),
  );
}

function parseStagedRubricData(rawRubricData: unknown): RubricData | null {
  const parsedRubricData = RubricDataSchema.safeParse(rawRubricData);
  return parsedRubricData.success ? parsedRubricData.data : null;
}

function findRubricItemIndex({
  rubricData,
  targetRubricItemId,
  targetRubricItemNumber,
}: {
  rubricData: RubricData;
  targetRubricItemId?: string;
  targetRubricItemNumber?: number;
}): number {
  if (targetRubricItemId) {
    return rubricData.rubric_items.findIndex((item) => item.rubric_item.id === targetRubricItemId);
  }
  if (targetRubricItemNumber != null) {
    return rubricData.rubric_items.findIndex(
      (item) => item.rubric_item.number === targetRubricItemNumber,
    );
  }
  return -1;
}

function createAiGradingAgent({
  model,
  context,
}: {
  model: LanguageModel;
  context: AiGradingAgentContext;
}) {
  let workingRubricData = parseStagedRubricData(context.stagedRubricData);
  let workingRubricItemDiffs = parseRubricItemDiffs(context.stagedRubricItemDiffs);

  const ensureWorkingRubricData = async (): Promise<RubricData> => {
    if (workingRubricData) {
      return workingRubricData;
    }

    const dbRubricData = await manualGrading.selectRubricData({
      assessment_question: context.assessmentQuestion,
    });
    if (!dbRubricData) {
      throw new Error('No rubric is available to modify.');
    }

    workingRubricData = dbRubricData;
    return dbRubricData;
  };

  const getWorkingRubricData = async (): Promise<RubricData> => {
    return structuredClone(await ensureWorkingRubricData());
  };

  const getWorkingRubricDiffs = (): Partial<Record<number, RubricItemDiff>> => {
    return structuredClone(workingRubricItemDiffs);
  };

  const setWorkingProposalState = ({
    rubricData,
    rubricItemDiffs,
  }: {
    rubricData: RubricData;
    rubricItemDiffs: Partial<Record<number, RubricItemDiff>>;
  }) => {
    workingRubricData = rubricData;
    workingRubricItemDiffs = rubricItemDiffs;
  };

  return new ToolLoopAgent({
    model,
    instructions: AI_GRADING_AGENT_INSTRUCTIONS,
    stopWhen: [stepCountIs(10)],
    prepareStep: ({ messages, steps }) => {
      const requestedChanges = userRequestedRubricChanges(messages);
      if (requestedChanges) {
        const latestUserMessage = [...messages]
          .reverse()
          .find((message) => message.role === 'user');
        const latestUserText = latestUserMessage
          ? getMessageText(latestUserMessage).toLowerCase()
          : '';
        const requestedMerge =
          latestUserText.includes('merge') || latestUserText.includes('combine');
        const usedGetRubricItems = steps.some((step) =>
          step.toolCalls.some(({ toolName }) => toolName === 'get_rubric_items'),
        );
        const usedProposalTool = steps.some((step) =>
          step.toolCalls.some(({ toolName }) =>
            [
              'propose_add_rubric_item',
              'propose_edit_rubric_item',
              'propose_delete_rubric_item',
            ].includes(toolName),
          ),
        );
        const usedEditProposal = steps.some((step) =>
          step.toolCalls.some(({ toolName }) => toolName === 'propose_edit_rubric_item'),
        );
        const usedDeleteProposal = steps.some((step) =>
          step.toolCalls.some(({ toolName }) => toolName === 'propose_delete_rubric_item'),
        );

        if (!usedGetRubricItems) {
          return {
            activeTools: ['get_rubric_items'],
            toolChoice: 'required',
          };
        }
        if (requestedMerge && !usedEditProposal) {
          return {
            activeTools: ['propose_edit_rubric_item'],
            toolChoice: 'required',
          };
        }
        if (requestedMerge && !usedDeleteProposal) {
          return {
            activeTools: ['propose_delete_rubric_item'],
            toolChoice: 'required',
          };
        }
        if (!usedProposalTool) {
          return {
            activeTools: [
              'propose_add_rubric_item',
              'propose_edit_rubric_item',
              'propose_delete_rubric_item',
            ],
            toolChoice: 'required',
          };
        }

        return {
          activeTools: [
            'get_rubric_items',
            'propose_add_rubric_item',
            'propose_edit_rubric_item',
            'propose_delete_rubric_item',
          ],
          toolChoice: 'auto',
        };
      }

      const started = userStartedRubricGeneration(messages);
      if (!started) {
        return { toolChoice: 'none' };
      }

      const usedGetInitializationContext = steps.some((step) =>
        step.toolCalls.some(({ toolName }) => toolName === 'get_initialization_context'),
      );
      const usedSetRubric = steps.some((step) =>
        step.toolCalls.some(({ toolName }) => toolName === 'set_rubric'),
      );

      if (!usedGetInitializationContext) {
        return {
          activeTools: ['get_initialization_context'],
          toolChoice: 'required',
        };
      }

      if (!usedSetRubric) {
        return {
          activeTools: ['set_rubric'],
          toolChoice: 'required',
        };
      }

      return { toolChoice: 'none' };
    },
    tools: {
      get_initialization_context: tool({
        description:
          'Retrieve rubric initialization context: up to 5 random submissions, question HTML, answer HTML, and current rubric.',
        inputSchema: z.object({}),
        outputSchema: z.object({
          question_html: z.string(),
          answer_html: z.string(),
          sample_submissions: z.array(
            z.object({
              instance_question_id: IdSchema,
              submission_message: z.unknown(),
            }),
          ),
          current_rubric: z.unknown().nullable(),
        }),
        execute: async () => {
          return await getInitializationContext(context);
        },
      }),
      set_rubric: tool({
        description:
          'Set the finalized rubric for this assessment question. Call this only after get_initialization_context.',
        inputSchema: SetRubricInputSchema,
        outputSchema: z.object({
          updated: z.literal(true),
          message: z.string(),
        }),
        execute: async (body) => {
          if (!context.hasCourseInstancePermissionEdit) {
            throw new Error('Access denied (must be a student data editor)');
          }

          await manualGrading.updateAssessmentQuestionRubric({
            assessment: context.assessment,
            assessment_question_id: context.assessmentQuestion.id,
            use_rubric: body.use_rubric,
            replace_auto_points: body.replace_auto_points,
            starting_points: body.starting_points,
            min_points: body.min_points,
            max_extra_points: body.max_extra_points,
            rubric_items: body.rubric_items,
            tag_for_manual_grading: body.tag_for_manual_grading,
            grader_guidelines: body.grader_guidelines,
            authn_user_id: context.authnUserId,
          });

          return {
            updated: true as const,
            message: 'Rubric updated successfully.',
          };
        },
      }),
      get_rubric_items: tool({
        description:
          'Retrieve the current working rubric items (including pending staged statuses) before proposing edits.',
        inputSchema: z.object({}),
        outputSchema: GetRubricItemsOutputSchema,
        execute: async () => {
          const rubricData = await getWorkingRubricData();
          const rubricItemDiffs = getWorkingRubricDiffs();
          return {
            rubric_items: rubricData.rubric_items.map((item, index) => {
              const diff = rubricItemDiffs[index];
              return {
                row_index: index,
                rubric_item_id: item.rubric_item.id,
                rubric_item_number: item.rubric_item.number,
                points: item.rubric_item.points,
                description: item.rubric_item.description,
                explanation: item.rubric_item.explanation,
                grader_note: item.rubric_item.grader_note,
                always_show_to_students: item.rubric_item.always_show_to_students,
                pending_status: diff?.status ?? 'none',
                pending_changed_fields: diff?.changed_fields ?? [],
              };
            }),
          };
        },
      }),
      propose_add_rubric_item: tool({
        description:
          'Propose adding a new rubric item. This is temporary and does not save to the database.',
        inputSchema: ProposeAddRubricItemInputSchema,
        outputSchema: ProposalToolOutputSchema,
        execute: async (body) => {
          const rubricData = await getWorkingRubricData();
          const rubricItemDiffs = getWorkingRubricDiffs();

          const maxNumber = rubricData.rubric_items.reduce(
            (max, item) => Math.max(max, item.rubric_item.number),
            0,
          );
          const tempId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
          rubricData.rubric_items.push({
            rubric_item: {
              id: tempId,
              rubric_id: rubricData.rubric.id,
              number: maxNumber + 1,
              points: body.points,
              description: body.description,
              explanation: body.explanation,
              grader_note: body.grader_note,
              always_show_to_students: body.always_show_to_students,
              deleted_at: null,
              key_binding: null,
            } as RubricData['rubric_items'][number]['rubric_item'],
            num_submissions: 0,
          });

          const addedIndex = rubricData.rubric_items.length - 1;
          rubricItemDiffs[addedIndex] = {
            status: 'new',
            changed_fields: [
              'points',
              'description',
              'explanation',
              'grader_note',
              'always_show_to_students',
            ],
            description: 'Proposed by AI.',
          };
          setWorkingProposalState({ rubricData, rubricItemDiffs });

          return {
            message: 'Proposed a new rubric item.',
            proposed_rubric: rubricData,
            proposed_rubric_item_diffs: stringifyRubricItemDiffs(rubricItemDiffs),
          };
        },
      }),
      propose_edit_rubric_item: tool({
        description:
          'Propose editing an existing rubric item. This is temporary and does not save to the database.',
        inputSchema: ProposeEditRubricItemInputSchema,
        outputSchema: ProposalToolOutputSchema,
        execute: async (body) => {
          const rubricData = await getWorkingRubricData();
          const rubricItemDiffs = getWorkingRubricDiffs();

          const itemIndex = findRubricItemIndex({
            rubricData,
            targetRubricItemId: body.target_rubric_item_id,
            targetRubricItemNumber: body.target_rubric_item_number,
          });
          if (itemIndex < 0) {
            throw new Error('Unable to find rubric item to edit.');
          }

          const rubricItem = rubricData.rubric_items[itemIndex].rubric_item;
          const changedFields: RubricDiffField[] = [];

          if (body.points !== undefined && body.points !== rubricItem.points) {
            rubricItem.points = body.points;
            changedFields.push('points');
          }
          if (body.description !== undefined && body.description !== rubricItem.description) {
            rubricItem.description = body.description;
            changedFields.push('description');
          }
          if (body.explanation !== undefined && body.explanation !== rubricItem.explanation) {
            rubricItem.explanation = body.explanation;
            changedFields.push('explanation');
          }
          if (body.grader_note !== undefined && body.grader_note !== rubricItem.grader_note) {
            rubricItem.grader_note = body.grader_note;
            changedFields.push('grader_note');
          }
          if (
            body.always_show_to_students !== undefined &&
            body.always_show_to_students !== rubricItem.always_show_to_students
          ) {
            rubricItem.always_show_to_students = body.always_show_to_students;
            changedFields.push('always_show_to_students');
          }

          const priorDiff = rubricItemDiffs[itemIndex];
          rubricItemDiffs[itemIndex] = {
            status: priorDiff?.status === 'new' ? 'new' : 'updated',
            changed_fields:
              priorDiff?.status === 'new'
                ? [...new Set([...priorDiff.changed_fields, ...changedFields])]
                : changedFields,
            description: 'Proposed by AI.',
          };
          setWorkingProposalState({ rubricData, rubricItemDiffs });

          return {
            message: 'Proposed updates to a rubric item.',
            proposed_rubric: rubricData,
            proposed_rubric_item_diffs: stringifyRubricItemDiffs(rubricItemDiffs),
          };
        },
      }),
      propose_delete_rubric_item: tool({
        description:
          'Propose deleting an existing rubric item. This is temporary and does not save to the database.',
        inputSchema: ProposeDeleteRubricItemInputSchema,
        outputSchema: ProposalToolOutputSchema,
        execute: async (body) => {
          const rubricData = await getWorkingRubricData();
          const rubricItemDiffs = getWorkingRubricDiffs();

          const itemIndex = findRubricItemIndex({
            rubricData,
            targetRubricItemId: body.target_rubric_item_id,
            targetRubricItemNumber: body.target_rubric_item_number,
          });
          if (itemIndex < 0) {
            throw new Error('Unable to find rubric item to delete.');
          }

          rubricItemDiffs[itemIndex] = {
            status: 'removed',
            changed_fields: [],
            description: 'Proposed by AI.',
          };
          setWorkingProposalState({ rubricData, rubricItemDiffs });

          return {
            message: 'Proposed removing a rubric item.',
            proposed_rubric: rubricData,
            proposed_rubric_item_diffs: stringifyRubricItemDiffs(rubricItemDiffs),
          };
        },
      }),
    },
  });
}

export async function streamAiGradingAssistantResponse({
  messages,
  context,
}: {
  messages: ModelMessage[];
  context: AiGradingAgentContext;
}) {
  const { model } = getAgenticGradingModel();
  const agent = createAiGradingAgent({ model, context });
  return await agent.stream({ messages });
}
