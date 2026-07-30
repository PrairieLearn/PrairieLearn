import { useQueryClient } from '@tanstack/react-query';

import { useTRPC } from '../../../trpc/course/context.js';

export function useInvalidateQuestionsList() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return () => queryClient.invalidateQueries(trpc.questions.list.queryFilter());
}
