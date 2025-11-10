import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { BatchActionData, BatchActionParams } from '../assessmentQuestion.types.js';

interface UseBatchActionsParams {
  csrfToken: string;
  urlPrefix: string;
  assessmentId: string;
  assessmentQuestionId: string;
  setErrorMessage: (message: string | null) => void;
  setSuccessMessage: (message: string | null) => void;
}

export function useBatchActions({
  csrfToken,
  urlPrefix,
  assessmentId,
  assessmentQuestionId,
  setErrorMessage,
  setSuccessMessage,
}: UseBatchActionsParams) {
  const queryClient = useQueryClient();

  // Mutation for batch actions
  const batchActionMutation = useMutation<
    { jobSequenceId?: string; success: boolean },
    Error,
    BatchActionParams
  >({
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

      const response = await fetch('', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Request failed with status ' + response.status);
      }

      const data = await response.json();
      return data as { jobSequenceId?: string; success: boolean };
    },
    onSuccess: (data) => {
      setErrorMessage(null); // Clear any previous errors

      if (data.jobSequenceId) {
        // Redirect to job sequence page for long-running operations (AI grading, AI grouping)
        window.location.href = `${urlPrefix}/jobSequence/${data.jobSequenceId}`;
      } else if (data.success) {
        // Refresh the table data for quick operations (assign grader, manual grading flag)
        void queryClient.invalidateQueries({
          queryKey: ['instance-questions', urlPrefix, assessmentId, assessmentQuestionId],
        });
      }
    },
    onError: (error) => {
      console.error('Batch action failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
    },
  });

  // Handler for batch actions
  const handleBatchAction = (actionData: BatchActionData, instanceQuestionIds: string[]) => {
    if (instanceQuestionIds.length === 0) return;

    batchActionMutation.mutate({
      action: 'batch_action',
      actionData,
      instanceQuestionIds,
    });
  };

  // Mutation for deleting all AI grading jobs
  const deleteAiGradingJobsMutation = useMutation<
    { success: boolean; numDeleted: number },
    Error,
    undefined
  >({
    mutationFn: async () => {
      const response = await fetch('', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    onSuccess: (data) => {
      setErrorMessage(null);
      setSuccessMessage(
        `Deleted AI grading results for ${data.numDeleted} ${data.numDeleted === 1 ? 'question' : 'questions'}.`,
      );
      void queryClient.invalidateQueries({
        queryKey: ['instance-questions', urlPrefix, assessmentId, assessmentQuestionId],
      });
    },
    onError: (error) => {
      console.error('Delete AI grading jobs failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
    },
  });

  // Mutation for deleting all AI instance question groupings
  const deleteAiGroupingsMutation = useMutation<
    { success: boolean; numDeleted: number },
    Error,
    undefined
  >({
    mutationFn: async () => {
      const response = await fetch('', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          __csrf_token: csrfToken,
          __action: 'delete_ai_instance_question_groupings',
        }),
      });

      if (!response.ok) {
        throw new Error('Request failed with status ' + response.status);
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      setErrorMessage(null);
      setSuccessMessage(
        `Deleted AI submission grouping results for ${data.numDeleted} ${data.numDeleted === 1 ? 'question' : 'questions'}.`,
      );
      void queryClient.invalidateQueries({
        queryKey: ['instance-questions', urlPrefix, assessmentId, assessmentQuestionId],
      });
    },
    onError: (error) => {
      console.error('Delete AI groupings failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
    },
  });

  return {
    batchActionMutation,
    handleBatchAction,
    deleteAiGradingJobsMutation,
    deleteAiGroupingsMutation,
  };
}
