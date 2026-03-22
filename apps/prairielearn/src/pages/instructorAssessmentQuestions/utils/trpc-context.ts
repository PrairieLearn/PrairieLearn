import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AssessmentQuestionsRouter } from '../trpc.js';

const context = createTRPCContext<AssessmentQuestionsRouter>();
export const { TRPCProvider, useTRPC } = context;
