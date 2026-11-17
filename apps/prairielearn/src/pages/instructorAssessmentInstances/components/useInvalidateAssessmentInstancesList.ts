import { useQueryClient } from '@tanstack/react-query';

import { useTRPC } from '../../../trpc/assessment/context.js';

export function useInvalidateAssessmentInstancesList() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return () => queryClient.invalidateQueries(trpc.assessmentInstances.list.queryFilter());
}
