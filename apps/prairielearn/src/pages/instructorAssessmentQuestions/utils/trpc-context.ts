import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AssessmentQuestionsRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AssessmentQuestionsRouter>();
