import { useMutation, useQueryClient } from '@tanstack/react-query';

import { run } from '@prairielearn/run';

import type { AiGradingModelId } from '../../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { getCourseInstanceJobSequenceUrl } from '../../../../lib/client/url.js';

import { client } from './trpc.js';

export function useManualGradingActions({ courseInstanceId }: { courseInstanceId: string }) {
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
    { job_sequence_id: string },
    Error,
    {
      action:
        | 'batch_action'
        | 'ai_instance_question_group_assessment_all'
        | 'ai_instance_question_group_assessment_ungrouped';
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
      const res = await client.aiGroupInstanceQuestions.mutate({
        selection: run(() => {
          if (action === 'batch_action') {
            // TODO: we can make the calls to this function more type-safe.
            return instanceQuestionIds ?? [];
          }
          if (action === 'ai_instance_question_group_assessment_all') {
            return 'all';
          }
          return 'ungrouped';
        }),
        closed_instance_questions_only: numOpenInstances > 0 ? closedSubmissionsOnly : false,
      });
      return { job_sequence_id: res.job_sequence_id };
    },
    onSuccess: (data) => {
      window.location.href = getCourseInstanceJobSequenceUrl(
        courseInstanceId,
        data.job_sequence_id,
      );
    },
  });

  const gradeSubmissionsMutation = useMutation<
    { job_sequence_id: string },
    Error,
    { selection: 'all' | 'human_graded' | string[]; model_id: AiGradingModelId }
  >({
    mutationFn: async ({ selection, model_id }) => {
      const res = await client.aiGradeInstanceQuestions.mutate({
        selection,
        model_id,
      });
      return { job_sequence_id: res.job_sequence_id };
    },
    onSuccess: (data) => {
      window.location.href = getCourseInstanceJobSequenceUrl(
        courseInstanceId,
        data.job_sequence_id,
      );
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
