import {
  type StepResult,
  type WorkflowStepContext,
  registerWorkflow,
} from '@prairielearn/workflows';

import * as manualGrading from '../../../lib/manualGrading.js';

import { selectInstanceQuestionsForAssessmentQuestion } from './ai-grading-util.js';

/**
 * AI Grading Workflow State Machine
 *
 * Phase 1: rubric_setup
 *   - rubric_check → check if rubric exists
 *   - initialize_prompt → no rubric, waiting for user (generate? skip?)
 *   - generating_rubric → AI generates rubric
 *   - rubric_ready → rubric loaded, user confirms or edits
 *   - rubric_editing → user is editing, waiting for edit instruction
 *
 * Phase 2: grading (STUB — no actual AI grading yet)
 *   - grading_submission → pop next submission, mark as "graded"
 *   - check_remaining → check if more submissions
 *
 * Phase 3: complete
 *   - review_final → all done, user reviews
 *   - done → terminal
 */

interface AiGradingState {
  step: string;
  rubric_exists?: boolean;
  rubric_id?: string;
  assessment_question_id?: string;
  /** Grading phase */
  submission_ids?: string[];
  submission_index?: number;
  total_submissions?: number;
  graded_count?: number;
  /** User input (merged via resumeWorkflow) */
  action?: string;
  message?: string;
  user_suggestion?: string;
}

function getState(context: WorkflowStepContext): AiGradingState {
  return context.run.state as unknown as AiGradingState;
}

function result(
  phase: string,
  state: AiGradingState,
  status: StepResult['status'],
  extras?: { output?: string; error_message?: string },
): StepResult {
  return {
    phase,
    state: state as unknown as Record<string, unknown>,
    status,
    ...extras,
  };
}

async function takeStep(context: WorkflowStepContext): Promise<StepResult> {
  const state = getState(context);
  const { logger } = context;

  switch (state.step) {
    // -----------------------------------------------------------------
    // Phase 1: Rubric Setup
    // -----------------------------------------------------------------

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
      // User provides action via resumeWorkflow input
      const action = state.action;

      if (action === 'generate') {
        return result(
          'rubric_setup',
          { ...state, step: 'generating_rubric', action: undefined },
          'running',
        );
      }

      if (action === 'skip') {
        return result(
          'rubric_setup',
          { ...state, step: 'rubric_ready', action: undefined },
          'waiting_for_input',
        );
      }

      // If no recognized action, stay waiting
      return result('rubric_setup', { ...state, step: 'initialize_prompt' }, 'waiting_for_input');
    }

    case 'generating_rubric': {
      // The actual rubric generation is triggered by the route handler
      // which calls generateRubric() and then resumes the workflow.
      // When we reach this step via the step loop, the generation has
      // already been initiated by the route handler. We transition to
      // rubric_ready.
      logger.info('Rubric generation step — transitioning to rubric_ready');
      return result(
        'rubric_setup',
        { ...state, step: 'rubric_ready', rubric_exists: true },
        'waiting_for_input',
      );
    }

    case 'rubric_ready': {
      const action = state.action;

      if (action === 'proceed') {
        logger.info('User approved rubric, moving to grading phase');
        // Gather submissions for grading
        const assessmentQuestionId = context.run.context.assessment_question_id as string;
        const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
          assessment_question_id: assessmentQuestionId,
        });

        const submissionIds = instanceQuestions.map((iq) => iq.id);
        return result(
          'grading',
          {
            ...state,
            step: 'grading_submission',
            action: undefined,
            submission_ids: submissionIds,
            submission_index: 0,
            total_submissions: submissionIds.length,
            graded_count: 0,
          },
          'running',
        );
      }

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
      // The actual edit is performed by the route handler calling editRubric().
      // Once the edit completes, the route handler resumes the workflow
      // with action: 'edit_complete'.
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

    // -----------------------------------------------------------------
    // Phase 2: Grading (STUB — no actual AI grading)
    // -----------------------------------------------------------------

    case 'grading_submission': {
      const submissionIds = state.submission_ids ?? [];
      const index = state.submission_index ?? 0;

      if (index >= submissionIds.length) {
        // No more submissions
        return result('complete', { ...state, step: 'review_final' }, 'waiting_for_input');
      }

      // STUB: Just pop the submission and move on without actually grading
      logger.info(
        `Stub grading submission ${index + 1}/${submissionIds.length} (id: ${submissionIds[index]})`,
      );

      return result(
        'grading',
        {
          ...state,
          step: 'check_remaining',
          submission_index: index + 1,
          graded_count: (state.graded_count ?? 0) + 1,
        },
        'running',
      );
    }

    case 'check_remaining': {
      const submissionIds = state.submission_ids ?? [];
      const index = state.submission_index ?? 0;

      if (index < submissionIds.length) {
        return result('grading', { ...state, step: 'grading_submission' }, 'running');
      }

      logger.info('All submissions processed, moving to completion');
      return result('complete', { ...state, step: 'review_final' }, 'waiting_for_input');
    }

    // -----------------------------------------------------------------
    // Phase 3: Completion
    // -----------------------------------------------------------------

    case 'review_final': {
      const action = state.action;

      if (action === 'exit') {
        return result('complete', { ...state, step: 'done', action: undefined }, 'completed');
      }

      if (action === 'rerun') {
        logger.info('User requested rerun, going back to grading');
        const assessmentQuestionId = context.run.context.assessment_question_id as string;
        const instanceQuestions = await selectInstanceQuestionsForAssessmentQuestion({
          assessment_question_id: assessmentQuestionId,
        });

        const submissionIds = instanceQuestions.map((iq) => iq.id);
        return result(
          'grading',
          {
            ...state,
            step: 'grading_submission',
            action: undefined,
            submission_ids: submissionIds,
            submission_index: 0,
            total_submissions: submissionIds.length,
            graded_count: 0,
          },
          'running',
        );
      }

      if (action === 'edit_rubric') {
        return result(
          'rubric_setup',
          { ...state, step: 'rubric_editing', action: undefined },
          'waiting_for_input',
        );
      }

      // Stay waiting — "AI grading complete. Rerun?"
      return result('complete', { ...state, step: 'review_final' }, 'waiting_for_input');
    }

    case 'done': {
      return result('complete', state, 'completed');
    }

    default: {
      return result(context.run.phase, state, 'failed', {
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
