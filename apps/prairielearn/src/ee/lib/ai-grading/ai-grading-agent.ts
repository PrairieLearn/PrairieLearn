import assert from 'node:assert';

import { createOpenAI } from '@ai-sdk/openai';
import { type LanguageModel, type ModelMessage, generateObject } from 'ai';
import z from 'zod';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

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
import * as questionServers from '../../../question-servers/index.js';

import type { AiGradingModelId } from './ai-grading-models.shared.js';
import {
  generateSubmissionMessage,
  selectInstanceQuestionsForAssessmentQuestion,
  selectLastVariantAndSubmission,
} from './ai-grading-util.js';

const sql = loadSqlEquiv(import.meta.url);

const AGENTIC_AI_GRADING_MODEL: AiGradingModelId = 'gpt-5-mini-2025-08-07';

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

type RubricOutput = z.infer<typeof RubricOutputSchema>;

const EditRubricOutputSchema = z.object({
  message: z
    .string()
    .describe(
      'A conversational response to the instructor explaining what you did or answering their question.',
    ),
  updated_rubric: RubricOutputSchema.nullable().describe(
    'The updated rubric if changes were made, or null if no rubric changes are needed (e.g. when answering a question).',
  ),
});

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

export const RUBRIC_EDITING_SYSTEM_PROMPT = [
  'You are a lead teaching assistant for a course.',
  'The instructor will provide you with the current rubric and may ask you to modify it or ask questions about it.',
  'You have access to the full conversation history of all previous refinement requests.',
  'If the instructor asks you to modify the rubric, follow the instructions carefully and provide the updated rubric in updated_rubric.',
  'If the instructor asks a question or does not request changes, respond conversationally in the message field and set updated_rubric to null.',
  'Maintain the overall structure unless explicitly told to change it.',
  'Consider the context from previous conversations when making changes.',
  'Questions students received were programmatically generated and randomized. Avoid hardcoding randomized quantities and final solutions.',
  'This rubric should work for any random variant of the question.',
  'Rubric items cannot have partial credit: they are either fully awarded or not awarded at all.',
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

export interface GenerateRubricResult {
  rubric: RubricOutput;
  summary: string;
}

export interface EditRubricResult {
  summary: string;
  rubricModified: boolean;
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

async function insertUserMessage({
  assessmentQuestionId,
  authnUserId,
  phase,
  text,
}: {
  assessmentQuestionId: string;
  authnUserId: string;
  phase: 'generate' | 'edit';
  text: string;
}) {
  await execute(sql.insert_user_message, {
    assessment_question_id: assessmentQuestionId,
    authn_user_id: authnUserId,
    phase,
    parts: JSON.stringify([{ type: 'text', text }]),
  });
}

async function insertInitialAssistantMessage({
  assessmentQuestionId,
  jobSequenceId,
  phase,
  modelId,
}: {
  assessmentQuestionId: string;
  jobSequenceId: string;
  phase: 'generate' | 'edit';
  modelId: string;
}) {
  return await queryRow(
    sql.insert_initial_assistant_message,
    {
      assessment_question_id: assessmentQuestionId,
      job_sequence_id: jobSequenceId,
      phase,
      model: modelId,
    },
    AiGradingMessageSchema,
  );
}

async function finalizeAssistantMessage({
  messageId,
  status,
  parts,
  modelId,
  usage,
}: {
  messageId: string;
  status: 'completed' | 'errored';
  parts: { type: string; text: string }[];
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
// Phase 1: Generate Rubric
// ---------------------------------------------------------------------------

export async function generateRubric(
  context: AiGradingAgentContext,
  job: JobLogger,
  jobSequenceId: string,
): Promise<GenerateRubricResult> {
  if (!context.hasCourseInstancePermissionEdit) {
    throw new Error('Access denied (must be a student data editor)');
  }

  // Persist the user message
  await insertUserMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    authnUserId: context.authnUserId,
    phase: 'generate',
    text: 'Generate a new rubric.',
  });

  const { model, modelId } = getAgenticGradingModel();

  // Insert the initial assistant message (streaming)
  const messageRow = await insertInitialAssistantMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    jobSequenceId,
    phase: 'generate',
    modelId,
  });

  try {
    const initContext = await getInitializationContext(context);

    const messages: ModelMessage[] = [
      { role: 'system', content: RUBRIC_GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: `Question HTML:\n${initContext.question_html}` },
      { role: 'user', content: `Answer HTML:\n${initContext.answer_html}` },
    ];

    // Add sample submissions as text
    for (const sub of initContext.sample_submissions) {
      messages.push(sub.submission_message);
    }

    // Add current rubric if one exists
    if (initContext.current_rubric) {
      messages.push({
        role: 'user',
        content: `The current rubric (if any) is:\n${JSON.stringify(initContext.current_rubric, null, 2)}`,
      });
    }

    job.info('Phase: generate');
    job.info('System prompt: ' + RUBRIC_GENERATION_SYSTEM_PROMPT);
    job.info('Model messages: ' + JSON.stringify(messages, null, 2));

    const result = await generateObject({
      model,
      schema: RubricOutputSchema,
      messages,
    });

    job.info('Generated rubric: ' + JSON.stringify(result.object, null, 2));
    job.info('Usage: ' + JSON.stringify(result.usage, null, 2));

    // Save to DB
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

    const itemSummaries = result.object.rubric_items
      .map((item) => `• ${item.description} (${item.points > 0 ? '+' : ''}${item.points} pts)`)
      .join('\n');

    const summary = `Generated a rubric with ${result.object.rubric_items.length} items:\n${itemSummaries}\n\nWould you like to make any changes to the rubric?`;

    // Finalize the assistant message
    await finalizeAssistantMessage({
      messageId: messageRow.id,
      status: 'completed',
      parts: [{ type: 'text', text: summary }],
      modelId,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    });

    return {
      rubric: result.object,
      summary,
    };
  } catch (err) {
    await finalizeAssistantMessage({
      messageId: messageRow.id,
      status: 'errored',
      parts: [{ type: 'text', text: String(err) }],
      modelId,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Edit Rubric
// ---------------------------------------------------------------------------

export async function editRubric(
  context: AiGradingAgentContext,
  instruction: string,
  persistedMessages: AiGradingMessage[],
  job: JobLogger,
  jobSequenceId: string,
): Promise<EditRubricResult> {
  // Persist the user message
  await insertUserMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    authnUserId: context.authnUserId,
    phase: 'edit',
    text: instruction,
  });

  const { model, modelId } = getAgenticGradingModel();

  // Insert the initial assistant message (streaming)
  const messageRow = await insertInitialAssistantMessage({
    assessmentQuestionId: context.assessmentQuestion.id,
    jobSequenceId,
    phase: 'edit',
    modelId,
  });

  try {
    const currentRubricData = await manualGrading.selectRubricData({
      assessment_question: context.assessmentQuestion,
    });
    if (!currentRubricData) {
      throw new Error('No rubric exists for this assessment question.');
    }

    const currentRubricJson = {
      rubric_items: currentRubricData.rubric_items.map((i) => ({
        points: i.rubric_item.points,
        description: i.rubric_item.description,
        explanation: i.rubric_item.explanation,
        grader_note: i.rubric_item.grader_note,
        always_show_to_students: i.rubric_item.always_show_to_students,
      })),
      starting_points: currentRubricData.rubric.starting_points,
      replace_auto_points: currentRubricData.rubric.replace_auto_points,
      min_points: currentRubricData.rubric.min_points,
      max_extra_points: currentRubricData.rubric.max_extra_points,
    };

    const messages: ModelMessage[] = [
      { role: 'system', content: RUBRIC_EDITING_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Here is the current rubric:\n\n${JSON.stringify(currentRubricJson, null, 2)}`,
      },
    ];

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
      content: `Please modify the rubric according to this instruction:\n\n${instruction}`,
    });

    job.info('Phase: edit');
    job.info('System prompt: ' + RUBRIC_EDITING_SYSTEM_PROMPT);
    job.info('Model messages: ' + JSON.stringify(messages, null, 2));

    const result = await generateObject({
      model,
      schema: EditRubricOutputSchema,
      messages,
    });

    job.info('Edit result: ' + JSON.stringify(result.object, null, 2));
    job.info('Usage: ' + JSON.stringify(result.usage, null, 2));

    const { message, updated_rubric } = result.object;

    if (updated_rubric) {
      // Save to DB directly (same as generateRubric)
      await manualGrading.updateAssessmentQuestionRubric({
        assessment: context.assessment,
        assessment_question_id: context.assessmentQuestion.id,
        use_rubric: true,
        replace_auto_points: updated_rubric.replace_auto_points,
        starting_points: updated_rubric.starting_points,
        min_points: updated_rubric.min_points,
        max_extra_points: updated_rubric.max_extra_points,
        rubric_items: updated_rubric.rubric_items.map((item, idx) => ({
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
    }

    // Finalize the assistant message
    await finalizeAssistantMessage({
      messageId: messageRow.id,
      status: 'completed',
      parts: [{ type: 'text', text: message }],
      modelId,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    });

    return {
      summary: message,
      rubricModified: updated_rubric != null,
    };
  } catch (err) {
    await finalizeAssistantMessage({
      messageId: messageRow.id,
      status: 'errored',
      parts: [{ type: 'text', text: String(err) }],
      modelId,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    throw err;
  }
}
