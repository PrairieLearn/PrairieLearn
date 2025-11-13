import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getJobSequenceUrl } from '../../../../lib/client/url.js';
import type { BatchActionData, BatchActionParams } from '../assessmentQuestion.types.js';

interface UseManualGradingActionsParams {
  csrfToken: string;
}

export function useManualGradingActions({ csrfToken }: UseManualGradingActionsParams) {
  const queryClient = useQueryClient();

  // Mutation for batch actions
  const batchActionMutation = useMutation<{ job_sequence_id: string }, Error, BatchActionParams>({
    mutationFn: async (params: BatchActionParams) => {
      const requestBody: Record<string, any> = {
        __csrf_token: csrfToken,
        __action: params.action,
      };

      // Add action-specific data
      if (params.action === 'batch_action') {
        const { actionData, instanceQuestionIds } = params;

        if ('batch_action' in actionData) {
          // For AI grading/grouping actions
          requestBody.batch_action = actionData.batch_action;
          if (actionData.closed_instance_questions_only !== undefined) {
            requestBody.closed_instance_questions_only = actionData.closed_instance_questions_only;
          }
        } else {
          // For regular batch actions
          requestBody.batch_action_data = actionData;
        }

        // Add instance question IDs
        requestBody.instance_question_id = instanceQuestionIds;
      }

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      return data;
    },
  });

  // Handler for batch actions
  const handleBatchAction = (
    actionData: BatchActionData,
    instanceQuestionIds: string[],
    urlPrefix: string,
  ) => {
    if (instanceQuestionIds.length === 0) return;

    batchActionMutation.mutate(
      {
        action: 'batch_action',
        actionData,
        instanceQuestionIds,
      },
      {
        onSuccess: (data) => {
          if (data.job_sequence_id) {
            // Redirect to job sequence page for long-running operations (AI grading, AI grouping)
            window.location.href = `${urlPrefix}/jobSequence/${data.job_sequence_id}`;
          } else {
            // Refresh the table data for quick operations (assign grader, manual grading flag)
            void queryClient.invalidateQueries({
              queryKey: ['instance-questions'],
            });
          }
        },
      },
    );
  };

  // Mutation for deleting all AI grading jobs
  const deleteAiGradingJobsMutation = useMutation<
    { success: boolean; numDeleted: number },
    Error,
    undefined
  >({
    mutationFn: async () => {
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          __csrf_token: csrfToken,
          __action: 'delete_ai_grading_jobs',
        }),
      });

      if (!response.ok) {
        throw new Error('Request failed with status ' + response.status);
      }

      const data = await response.json();
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['instance-questions'],
      });
    },
  });

  // Mutation for deleting all AI instance question groupings
  const deleteAiGroupingsMutation = useMutation<{ num_deleted: number }, Error, undefined>({
    mutationFn: async () => {
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          __csrf_token: csrfToken,
          __action: 'delete_ai_instance_question_groupings',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['instance-questions'],
      });
    },
  });

  // Mutation for group submission actions
  const groupSubmissionMutation = useMutation<
    { job_sequence_id: string },
    Error,
    {
      action: string;
      closedOnly: boolean;
      numOpenInstances: number;
      instanceQuestionIds?: string[];
    }
  >({
    mutationFn: async ({ action, closedOnly, numOpenInstances, instanceQuestionIds }) => {
      const requestBody: Record<string, any> = {
        __csrf_token: csrfToken,
        __action: action,
      };

      if (action === 'batch_action') {
        requestBody.batch_action = 'ai_instance_question_group_selected';
        requestBody.instance_question_id = instanceQuestionIds || [];
      }

      if (numOpenInstances > 0) {
        requestBody.closed_instance_questions_only = closedOnly;
      } else {
        requestBody.closed_instance_questions_only = false;
      }

      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.job_sequence_id) {
        window.location.href = getJobSequenceUrl(data.job_sequence_id);
      }
    },
  });

  // Mutation for toggling AI grading mode
  const toggleAiGradingModeMutation = useMutation<{ success: boolean }, Error, undefined>({
    mutationFn: async () => {
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          __csrf_token: csrfToken,
          __action: 'toggle_ai_grading_mode',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle AI grading mode');
      }

      return { success: true };
    },
  });

  return {
    batchActionMutation,
    handleBatchAction,
    deleteAiGradingJobsMutation,
    deleteAiGroupingsMutation,
    groupSubmissionMutation,
    toggleAiGradingModeMutation,
  };
}
