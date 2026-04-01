import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';

export function useManualGradingActions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const deleteAiGradingJobsMutation = useMutation({
    ...trpc.manualGrading.deleteAiGradingJobs.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.manualGrading.instances.queryKey() });
    },
  });

  const deleteAiGroupingsMutation = useMutation({
    ...trpc.manualGrading.deleteAiInstanceQuestionGroupings.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.manualGrading.instances.queryKey() });
    },
  });

  const groupSubmissionMutation = useMutation(
    trpc.manualGrading.aiGroupInstanceQuestions.mutationOptions(),
  );

  const gradeSubmissionsMutation = useMutation(
    trpc.manualGrading.aiGradeInstanceQuestions.mutationOptions(),
  );

  const setAssignedGraderMutation = useMutation({
    ...trpc.manualGrading.setAssignedGrader.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.manualGrading.instances.queryKey() });
    },
  });

  const setRequiresManualGradingMutation = useMutation({
    ...trpc.manualGrading.setRequiresManualGrading.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.manualGrading.instances.queryKey() });
    },
  });

  const setAiGradingModeMutation = useMutation(
    trpc.manualGrading.setAiGradingMode.mutationOptions(),
  );

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
