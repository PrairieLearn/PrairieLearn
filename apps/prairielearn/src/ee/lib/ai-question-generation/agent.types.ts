import {
  type InferUITools,
  type ToolSet,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
  tool,
} from 'ai';
import z from 'zod';

import type { EnumAiQuestionGenerationMessageStatus } from '../../../lib/db-types.js';
import { ALLOWED_ELEMENTS } from '../context-parsers/documentation.js';

interface QuestionGenerationUIMessageMetadata {
  job_sequence_id: string | null;
  status: EnumAiQuestionGenerationMessageStatus;
}

export type QuestionGenerationUIMessageTools = InferUITools<typeof QUESTION_GENERATION_TOOLS>;

export type QuestionGenerationUIMessage = UIMessage<
  QuestionGenerationUIMessageMetadata,
  UIDataTypes,
  QuestionGenerationUIMessageTools
>;

export type QuestionGenerationToolUIPart = ToolUIPart<QuestionGenerationUIMessageTools>;

const ALLOWED_ELEMENT_NAMES = Array.from(ALLOWED_ELEMENTS) as [string, ...string[]];

export const QUESTION_GENERATION_TOOLS = {
  readFile: tool({
    inputSchema: z.object({
      path: z.enum(['question.html', 'server.py']),
    }),
    outputSchema: z.string(),
  }),
  writeFile: tool({
    inputSchema: z.object({
      path: z.enum(['question.html', 'server.py']),
      content: z.string(),
    }),
  }),
  getElementDocumentation: tool({
    inputSchema: z.object({
      elementName: z.enum(ALLOWED_ELEMENT_NAMES),
    }),
    outputSchema: z.string(),
  }),
  listElementExamples: tool({
    inputSchema: z.object({
      elementName: z.enum(ALLOWED_ELEMENT_NAMES),
    }),
    outputSchema: z.array(
      z.object({
        qid: z.string(),
        description: z.string(),
      }),
    ),
  }),
  getExampleQuestions: tool({
    inputSchema: z.object({
      qids: z.array(z.string()),
    }),
    outputSchema: z.array(
      z.object({
        qid: z.string(),
        files: z.object({
          'question.html': z.string(),
          'server.py': z.string().nullable(),
        }),
      }),
    ),
  }),
  getPythonLibraries: tool({
    inputSchema: z.object({}),
    outputSchema: z.array(z.string()),
  }),
  saveAndValidateQuestion: tool({
    inputSchema: z.object({}),
    outputSchema: z.object({
      errors: z.array(z.string()),
    }),
  }),
} satisfies ToolSet;
