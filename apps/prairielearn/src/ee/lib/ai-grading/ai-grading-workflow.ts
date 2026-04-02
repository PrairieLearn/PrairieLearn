import {
  type StepResult,
  type WorkflowStepContext,
  registerWorkflow,
} from '@prairielearn/workflows';

import * as manualGrading from '../../../lib/manualGrading.js';

/**
 * AI Grading Workflow State Machine (Rubric Editing Only)
 *
 * Phase 1: rubric_setup
 *   - rubric_check → check if rubric exists
 *   - initialize_prompt → no rubric, waiting for user (generate? skip?)
 *   - generating_rubric → AI generates rubric
 *   - rubric_ready → rubric loaded, user confirms or edits
 *   - rubric_editing → user is editing, waiting for edit instruction
 */

interface AiGradingState {
  step: string;
  rubric_exists?: boolean;
  rubric_id?: string;
  assessment_question_id?: string;
  /** User input (merged via continueWorkflow) */
  action?: string;
  message?: string;
}

function getState(context: WorkflowStepContext<Record<string, unknown>>): AiGradingState {
  return context.run.state as unknown as AiGradingState;
}

function result(
  phase: string,
  state: AiGradingState,
  status: StepResult<Record<string, unknown>>['status'],
  extras?: { error_message?: string },
): StepResult<Record<string, unknown>> {
  return {
    phase,
    state: state as unknown as Record<string, unknown>,
    status,
    ...extras,
  };
}

async function takeStep(
  context: WorkflowStepContext<Record<string, unknown>>,
): Promise<StepResult<Record<string, unknown>>> {
  const state = getState(context);
  const { logger } = context;

  switch (state.step) {
    case 'rubric_check': {
      logger.info('Checking if rubric exists');
      const assessmentQuestionId = context.run.context.assessment_question_id as string;
      const rubricData = await manualGrading.selectRubricData({
        assessment_question: { id: assessmentQuestionId } as Parameters<
          typeof manualGrading.selectRubricData
        >[0]['assessment_question'],
      });

      if (rubricData) {
        logger.info('Rubric exists, moving to rubric_ready');
        return result(
          'rubric_setup',
          { ...state, step: 'rubric_ready', rubric_exists: true },
          'waiting_for_input',
        );
      } else {
        logger.info('No rubric found, prompting user');
        return result(
          'rubric_setup',
          { ...state, step: 'initialize_prompt', rubric_exists: false },
          'waiting_for_input',
        );
      }
    }

    case 'initialize_prompt': {
      const action = state.action;

      if (action === 'generate') {
        return result(
          'rubric_setup',
          { ...state, step: 'generating_rubric', action: undefined },
          'continue',
        );
      }

      if (action === 'skip') {
        return result(
          'rubric_setup',
          { ...state, step: 'rubric_ready', action: undefined },
          'waiting_for_input',
        );
      }

      return result('rubric_setup', { ...state, step: 'initialize_prompt' }, 'waiting_for_input');
    }

    case 'generating_rubric': {
      // The actual rubric generation is triggered by the route handler.
      // When we reach this step, transition to rubric_ready.
      logger.info('Rubric generation step — transitioning to rubric_ready');
      return result(
        'rubric_setup',
        { ...state, step: 'rubric_ready', rubric_exists: true },
        'waiting_for_input',
      );
    }

    case 'rubric_ready': {
      const action = state.action;

      if (action === 'edit') {
        return result(
          'rubric_setup',
          { ...state, step: 'rubric_editing', action: undefined },
          'waiting_for_input',
        );
      }

      // No action yet — stay waiting
      return result('rubric_setup', { ...state, step: 'rubric_ready' }, 'waiting_for_input');
    }

    case 'rubric_editing': {
      const action = state.action;

      if (action === 'edit_complete') {
        return result(
          'rubric_setup',
          { ...state, step: 'rubric_ready', action: undefined },
          'waiting_for_input',
        );
      }

      // Stay waiting for edit instruction
      return result('rubric_setup', { ...state, step: 'rubric_editing' }, 'waiting_for_input');
    }

    default: {
      return result(context.run.phase ?? 'rubric_setup', state, 'error', {
        error_message: `Unknown step: ${state.step}`,
      });
    }
  }
}

export function registerAiGradingWorkflow(): void {
  registerWorkflow({
    type: 'ai_grading',
    takeStep,
  });
}
