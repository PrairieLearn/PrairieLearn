import assert from 'node:assert';

import { createOpenAI } from '@ai-sdk/openai';
import { type LanguageModel, type ModelMessage, ToolLoopAgent, stepCountIs, tool } from 'ai';
import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { config } from '../../../lib/config.js';
import type { Assessment, AssessmentQuestion, Course, Question } from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
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

interface AiGradingAgentContext {
  assessment: Assessment;
  assessmentQuestion: AssessmentQuestion;
  course: Course;
  question: Question;
  urlPrefix: string;
  authnUserId: string;
  hasCourseInstancePermissionEdit: boolean;
}

interface RenderedSampleSubmission {
  instance_question_id: string;
  submission_message: ModelMessage;
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

function createAiGradingAgent({
  model,
  context,
}: {
  model: LanguageModel;
  context: AiGradingAgentContext;
}) {
  return new ToolLoopAgent({
    model,
    instructions: AI_GRADING_AGENT_INSTRUCTIONS,
    stopWhen: [stepCountIs(10)],
    prepareStep: ({ messages, steps }) => {
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
