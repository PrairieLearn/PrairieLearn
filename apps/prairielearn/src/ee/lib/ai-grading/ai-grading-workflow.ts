import { JsonToSseTransformStream, type ModelMessage } from 'ai';

import {
  type StepResult,
  type WorkflowStepContext,
  registerWorkflow,
} from '@prairielearn/workflows';

import * as manualGrading from '../../../lib/manualGrading.js';
import { selectAssessmentQuestionById } from '../../../models/assessment-question.js';
import { selectAssessmentById } from '../../../models/assessment.js';
import { selectCourseInstanceById } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { selectQuestionById } from '../../../models/question.js';
import {
  selectAiGradingMessages,
  selectLatestStreamingAiGradingMessage,
} from '../../models/ai-grading-message.js';

import {
  type AiGradingAgentContext,
  captureRubricSnapshot,
  editRubric,
  finalizeAssistantMessage,
  generateRubric,
} from './ai-grading-agent.js';
import { getAiGradingStreamContext, takeSseStream } from './redis.js';

/**
 * AI Grading Workflow — Rubric Editing
 *
 * The agent runs INSIDE takeStep for true fault tolerance.
 * Streaming to the client uses Redis-backed resumable streams.
 *
 * Steps:
 *   rubric_check → check if rubric exists → awaiting_input | rubric_ready
 *   awaiting_input → waiting for user to send a message
 *   agent_running → runs LLM agent, streams via Redis, finalizes message
 *   rubric_ready → rubric exists, waiting for next edit
 */

interface AiGradingState {
  step: string;
  phase?: 'generate' | 'edit';
  rubric_exists?: boolean;
  message_id?: string;
  user_message?: string;
  /**
   * Incremented on each continueWorkflow call. Used as a consistency check
   * so clients can detect when another user has advanced the workflow.
   */
  version?: number;
}

interface AiGradingContext {
  assessment_question_id: string;
  assessment_id: string;
  course_id: string;
  course_instance_id: string;
  question_id: string;
  url_prefix: string;
  authn_user_id: string;
  user_id: string;
  has_course_instance_permission_edit: string;
}

function getState(context: WorkflowStepContext<Record<string, unknown>>): AiGradingState {
  return context.run.state as unknown as AiGradingState;
}

function getContext(context: WorkflowStepContext<Record<string, unknown>>): AiGradingContext {
  return context.run.context as unknown as AiGradingContext;
}

function result(
  state: AiGradingState,
  status: StepResult<Record<string, unknown>>['status'],
): StepResult<Record<string, unknown>> {
  return {
    state: state as unknown as Record<string, unknown>,
    status,
  };
}

async function reconstructAgentContext(ctx: AiGradingContext): Promise<AiGradingAgentContext> {
  const [assessment, assessmentQuestion, course, courseInstance, question] = await Promise.all([
    selectAssessmentById(ctx.assessment_id),
    selectAssessmentQuestionById(ctx.assessment_question_id),
    selectCourseById(ctx.course_id),
    selectCourseInstanceById(ctx.course_instance_id),
    selectQuestionById(ctx.question_id),
  ]);
  return {
    assessment,
    assessmentQuestion,
    course,
    courseInstance,
    question,
    urlPrefix: ctx.url_prefix,
    authnUserId: ctx.authn_user_id,
    userId: ctx.user_id,
    hasCourseInstancePermissionEdit: ctx.has_course_instance_permission_edit === 'true',
  };
}

async function runAgentWithStreaming(opts: {
  agent: any;
  cancellationState: { wasCanceled: boolean };
  messageId: string;
  modelId: string;
  promptArg: { prompt: string } | { messages: ModelMessage[] };
  sseStream: JsonToSseTransformStream;
  workflowRunId: string;
  phase: 'generate' | 'edit';
  assessmentQuestionId: string;
  workflowVersion: number;
}) {
  const {
    agent,
    cancellationState,
    messageId,
    modelId,
    promptArg,
    sseStream,
    workflowRunId,
    phase,
    assessmentQuestionId,
    workflowVersion,
  } = opts;

  try {
    const agentRes = await agent.stream(promptArg);
    let finalParts: unknown[] = [];
    const errorState = { hasError: false };

    const uiStream = agentRes.toUIMessageStream({
      generateMessageId: () => messageId,
      messageMetadata: ({ part }: { part: { type: string } }) => {
        if (part.type === 'start') {
          return {
            workflow_run_id: workflowRunId,
            status: 'streaming',
            phase,
            workflow_version: workflowVersion,
          };
        }
        if (part.type === 'finish') {
          return {
            workflow_run_id: workflowRunId,
            status: cancellationState.wasCanceled
              ? 'canceled'
              : errorState.hasError
                ? 'errored'
                : 'completed',
            phase,
            rubric_modified: true,
            workflow_version: workflowVersion,
          };
        }
      },
      onFinish: async ({ responseMessage }: { responseMessage: { parts: unknown[] } }) => {
        finalParts = responseMessage.parts;
      },
      onError(err: unknown): string {
        errorState.hasError = true;
        return String(err);
      },
    });

    await uiStream.pipeTo(sseStream.writable);

    const totalUsage = await agentRes.totalUsage.then(
      (usage: { inputTokens?: number; outputTokens?: number }) => usage,
      () => ({ inputTokens: 0, outputTokens: 0 }),
    );

    const finalStatus = cancellationState.wasCanceled
      ? 'canceled'
      : errorState.hasError
        ? 'errored'
        : 'completed';

    const rubricSnapshot = await captureRubricSnapshot(assessmentQuestionId);

    await finalizeAssistantMessage({
      messageId,
      status: finalStatus,
      parts: finalParts,
      modelId,
      usage: {
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
      },
      rubricSnapshot,
    });
  } catch (err) {
    // If agent.stream() or pipeTo() throws, the message is stuck in
    // 'streaming' forever. Finalize it as errored so the UI converges.
    // Use a generic message for the user-visible parts; full details are
    // logged by the workflow engine when the re-thrown error is caught.
    await finalizeAssistantMessage({
      messageId,
      status: 'errored',
      parts: [
        {
          type: 'text',
          text: 'Something went wrong while generating a response. Please try again.',
        },
      ],
      modelId,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    throw err;
  }
}

async function takeStep(
  context: WorkflowStepContext<Record<string, unknown>>,
): Promise<StepResult<Record<string, unknown>>> {
  const state = getState(context);
  const { logger } = context;

  switch (state.step) {
    case 'rubric_check': {
      logger.info('Checking if rubric exists');
      const ctx = getContext(context);
      const rubricData = await manualGrading.selectRubricData({
        assessment_question: { id: ctx.assessment_question_id } as Parameters<
          typeof manualGrading.selectRubricData
        >[0]['assessment_question'],
      });

      if (rubricData) {
        logger.info('Rubric exists, moving to rubric_ready');
        return result({ ...state, step: 'rubric_ready', rubric_exists: true }, 'waiting');
      } else {
        logger.info('No rubric found, awaiting input');
        return result({ ...state, step: 'awaiting_input', rubric_exists: false }, 'waiting');
      }
    }

    case 'awaiting_input': {
      return result(state, 'waiting');
    }

    case 'agent_running': {
      const ctx = getContext(context);
      const messageId = state.message_id;
      const phase = state.phase;

      if (!messageId || !phase) {
        return {
          state: { ...state, step: 'rubric_ready' } as unknown as Record<string, unknown>,
          status: 'error',
          error_message: 'Missing message_id or phase in agent_running step',
        };
      }

      logger.info(`Running agent — phase: ${phase}, message: ${messageId}`);

      // Crash recovery: if there's already a streaming message that isn't ours,
      // finalize it as errored before starting fresh
      const existingStreaming = await selectLatestStreamingAiGradingMessage(
        ctx.assessment_question_id,
      );
      if (existingStreaming && existingStreaming.id !== messageId) {
        logger.info(`Finalizing stale streaming message ${existingStreaming.id} as errored`);
        await finalizeAssistantMessage({
          messageId: existingStreaming.id,
          status: 'errored',
          parts: [],
          modelId: existingStreaming.model ?? 'unknown',
          usage: { inputTokens: 0, outputTokens: 0 },
        });
      }

      const agentContext = await reconstructAgentContext(ctx);

      // Use the pre-created SSE stream from the route handler (normal flow).
      // For crash recovery (no pre-created stream), create a new one.
      let sseStream = takeSseStream(messageId);
      if (!sseStream) {
        logger.info('No pre-created stream found (crash recovery?), creating new stream');
        sseStream = new JsonToSseTransformStream();
        const streamContext = await getAiGradingStreamContext();
        await streamContext.createNewResumableStream(messageId, () => sseStream!.readable);
      }

      if (phase === 'generate') {
        const { agent, cancellationState, modelId } = await generateRubric(
          agentContext,
          logger,
          context.run.id,
          messageId,
        );

        await runAgentWithStreaming({
          agent,
          cancellationState,
          messageId,
          modelId,
          promptArg: { prompt: 'Generate a new rubric.' },
          sseStream,
          workflowRunId: context.run.id,
          phase,
          assessmentQuestionId: ctx.assessment_question_id,
          workflowVersion: state.version ?? 0,
        });
      } else {
        const persistedMessages = await selectAiGradingMessages(ctx.assessment_question_id);

        const { agent, cancellationState, modelId, messages } = await editRubric(
          agentContext,
          state.user_message ?? '',
          persistedMessages,
          logger,
          context.run.id,
          messageId,
        );

        await runAgentWithStreaming({
          agent,
          cancellationState,
          messageId,
          modelId,
          promptArg: { messages },
          sseStream,
          workflowRunId: context.run.id,
          phase,
          assessmentQuestionId: ctx.assessment_question_id,
          workflowVersion: state.version ?? 0,
        });
      }

      logger.info('Agent completed, returning to rubric_ready');
      return result(
        {
          step: 'rubric_ready',
          rubric_exists: true,
          version: state.version,
          // Clear transient fields
          message_id: undefined,
          user_message: undefined,
          phase: undefined,
        },
        'waiting',
      );
    }

    case 'rubric_ready': {
      return result(state, 'waiting');
    }

    default: {
      return {
        state: state as unknown as Record<string, unknown>,
        status: 'error',
        error_message: `Unknown step: ${state.step}`,
      };
    }
  }
}

export function registerAiGradingWorkflow(): void {
  registerWorkflow({
    type: 'ai_grading',
    takeStep,
  });
}
