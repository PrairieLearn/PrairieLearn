import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getCourseInstanceJobSequenceUrl } from '../../../../lib/client/url.js';

// Types for batch actions
export type BatchActionData =
  | { assigned_grader: string | null }
  | { requires_manual_grading: boolean }
  | { batch_action: 'ai_grade_assessment_selected'; closed_instance_questions_only?: boolean }
  | {
      batch_action: 'ai_instance_question_group_selected';
      closed_instance_questions_only?: boolean;
    };

export type BatchActionParams =
  | {
      action: 'batch_action';
      actionData: BatchActionData;
      instanceQuestionIds: string[];
    }
  | {
      action:
        | 'ai_grade_assessment_graded'
        | 'ai_grade_assessment_all'
        | 'ai_instance_question_group_assessment_all'
        | 'ai_instance_question_group_assessment_ungrouped';
    };

interface UseManualGradingActionsParams {
  csrfToken: string;
  courseInstanceId: string;
}

export function useManualGradingActions({
  csrfToken,
  courseInstanceId,
}: UseManualGradingActionsParams) {
  const queryClient = useQueryClient();

  // Mutation for batch actions
  const batchActionMutation = useMutation<
    { job_sequence_id: string } | null,
    Error,
    BatchActionParams
  >({
    mutationFn: async (params: BatchActionParams) => {
      const requestBody: Record<string, any> = {
        __csrf_token: csrfToken,
        __action: params.action,
      };

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

      if (response.status === 204) {
        return null;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: (data) => {
      if (data) {
        window.location.href = getCourseInstanceJobSequenceUrl(
          courseInstanceId,
          data.job_sequence_id,
        );
      } else {
        void queryClient.invalidateQueries({
          queryKey: ['instance-questions'],
        });
      }
    },
  });

  // Handler for batch actions
  const handleBatchAction = (actionData: BatchActionData, instanceQuestionIds: string[]) => {
    if (instanceQuestionIds.length === 0) return;

    batchActionMutation.mutate(
      {
        action: 'batch_action',
        actionData,
        instanceQuestionIds,
      },
      {
        onSuccess: (data) => {
          if (data) {
            // Redirect to job sequence page for long-running operations (AI grading, AI grouping)
            window.location.href = getCourseInstanceJobSequenceUrl(
              courseInstanceId,
              data.job_sequence_id,
            );
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
  const deleteAiGradingJobsMutation = useMutation<{ num_deleted: number }, Error, undefined>({
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
    { job_sequence_id: string } | null,
    Error,
    {
      action: string;
      closedSubmissionsOnly: boolean;
      numOpenInstances: number;
      instanceQuestionIds?: string[];
    }
  >({
    mutationFn: async ({
      action,
      closedSubmissionsOnly,
      numOpenInstances,
      instanceQuestionIds,
    }) => {
      const requestBody: Record<string, any> = {
        __csrf_token: csrfToken,
        __action: action,
      };

      if (action === 'batch_action') {
        requestBody.batch_action = 'ai_instance_question_group_selected';
        requestBody.instance_question_id = instanceQuestionIds || [];
      }

      if (numOpenInstances > 0) {
        requestBody.closed_instance_questions_only = closedSubmissionsOnly;
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

      if (response.status === 204) {
        return null;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: (data) => {
      if (data) {
        window.location.href = getCourseInstanceJobSequenceUrl(
          courseInstanceId,
          data.job_sequence_id,
        );
      }
    },
  });

  // Mutation for toggling AI grading mode
  const toggleAiGradingModeMutation = useMutation({
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

      if (response.status === 204) {
        return null;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }
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
