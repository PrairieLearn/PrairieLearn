import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AiGradingModelId } from '../../../../ee/lib/ai-grading/ai-grading-models.shared.js';

import type { ManualGradingTrpcClient } from './trpc-client.js';

export function useManualGradingActions(client: ManualGradingTrpcClient) {
  const queryClient = useQueryClient();

  const deleteAiGradingJobsMutation = useMutation<{ num_deleted: number }, Error, undefined>({
    mutationFn: async () => {
      const res = await client.deleteAiGradingJobs.mutate();
      return { num_deleted: res.num_deleted };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['instance-questions'] });
    },
  });

  const deleteAiGroupingsMutation = useMutation<{ num_deleted: number }, Error, undefined>({
    mutationFn: async () => {
      const res = await client.deleteAiInstanceQuestionGroupings.mutate();
      return { num_deleted: res.num_deleted };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['instance-questions'] });
    },
  });

  const groupSubmissionMutation = useMutation<
    { job_sequence_id: string; job_sequence_token: string },
    Error,
    {
      selection: 'all' | 'ungrouped' | string[];
      closedSubmissionsOnly: boolean;
    }
  >({
    mutationFn: async ({ selection, closedSubmissionsOnly }) => {
      const res = await client.aiGroupInstanceQuestions.mutate({
        selection,
        closed_instance_questions_only: closedSubmissionsOnly,
      });
      return { job_sequence_id: res.job_sequence_id, job_sequence_token: res.job_sequence_token };
    },
  });

  const gradeSubmissionsMutation = useMutation<
    { job_sequence_id: string; job_sequence_token: string },
    Error,
    { selection: 'all' | 'human_graded' | string[]; model_id: AiGradingModelId }
  >({
    mutationFn: async ({ selection, model_id }) => {
      const res = await client.aiGradeInstanceQuestions.mutate({
        selection,
        model_id,
      });
      return { job_sequence_id: res.job_sequence_id, job_sequence_token: res.job_sequence_token };
    },
  });

  const setAssignedGraderMutation = useMutation<
    unknown,
    Error,
    { assigned_grader: string | null; instance_question_ids: string[] }
  >({
    mutationFn: async ({ assigned_grader, instance_question_ids }) => {
      await client.setAssignedGrader.mutate({ assigned_grader, instance_question_ids });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['instance-questions'] });
    },
  });

  const setRequiresManualGradingMutation = useMutation<
    unknown,
    Error,
    { requires_manual_grading: boolean; instance_question_ids: string[] }
  >({
    mutationFn: async ({ requires_manual_grading, instance_question_ids }) => {
      await client.setRequiresManualGrading.mutate({
        requires_manual_grading,
        instance_question_ids,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['instance-questions'] });
    },
  });

  const setAiGradingModeMutation = useMutation({
    mutationFn: async (value: boolean) => {
      await client.setAiGradingMode.mutate({ enabled: value });
    },
  });

  return {
    deleteAiGradingJobsMutation,
    deleteAiGroupingsMutation,
    groupSubmissionMutation,
    gradeSubmissionsMutation,
    setAssignedGraderMutation,
    setRequiresManualGradingMutation,
    setAiGradingModeMutation,
  };
}
