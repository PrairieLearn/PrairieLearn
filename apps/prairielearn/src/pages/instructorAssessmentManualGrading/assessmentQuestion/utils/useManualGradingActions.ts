import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';

import { getCourseInstanceJobSequenceUrl } from '../../../../lib/client/url.js';
import type { ManualGradingAssessmentQuestionRouter } from '../trpc.js';

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

const client = createTRPCClient<ManualGradingAssessmentQuestionRouter>({
  links: [
    httpLink({
      // TODO: there might be a better way to do this?
      url: typeof window === 'undefined' ? '' : window.location.pathname + '/trpc',
      headers: {
        'X-TRPC': 'true',
      },
    }),
  ],
});

export function useManualGradingActions({
  csrfToken,
  courseInstanceId,
}: UseManualGradingActionsParams) {
  const queryClient = useQueryClient();

  const batchActionMutation = useMutation<
    { job_sequence_id: string } | null,
    Error,
    BatchActionParams
  >({
    mutationFn: async (params: BatchActionParams) => {
      // TODO: Once we use Zod on the backend, we should improve how this is constructed.
      const requestBody: Record<string, any> = {
        __csrf_token: csrfToken,
        __action: params.action,
        instance_question_id:
          'instanceQuestionIds' in params ? params.instanceQuestionIds : undefined,
      };

      if (params.action === 'batch_action') {
        const { actionData } = params;

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
      },
    );
  };

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

  const setAiGradingModeMutation = useMutation({
    mutationFn: async (value: boolean) => {
      await client.setAiGradingMode.mutate({ enabled: value });
    },
  });

  return {
    batchActionMutation,
    handleBatchAction,
    deleteAiGradingJobsMutation,
    deleteAiGroupingsMutation,
    groupSubmissionMutation,
    setAiGradingModeMutation,
  };
}
