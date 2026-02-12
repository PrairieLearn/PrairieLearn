import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTRPC } from './trpc-context.js';

export function useManualGradingActions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const deleteAiGradingJobsMutation = useMutation({
    ...trpc.deleteAiGradingJobs.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.instances.queryKey() });
    },
  });

  const deleteAiGroupingsMutation = useMutation({
    ...trpc.deleteAiInstanceQuestionGroupings.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.instances.queryKey() });
    },
  });

  const groupSubmissionMutation = useMutation(trpc.aiGroupInstanceQuestions.mutationOptions());

  const gradeSubmissionsMutation = useMutation(trpc.aiGradeInstanceQuestions.mutationOptions());

  const setAssignedGraderMutation = useMutation({
    ...trpc.setAssignedGrader.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.instances.queryKey() });
    },
  });

  const setRequiresManualGradingMutation = useMutation({
    ...trpc.setRequiresManualGrading.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.instances.queryKey() });
    },
  });

  const setAiGradingModeMutation = useMutation(trpc.setAiGradingMode.mutationOptions());

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
