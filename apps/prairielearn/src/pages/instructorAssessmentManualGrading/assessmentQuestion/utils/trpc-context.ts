import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { ManualGradingAssessmentQuestionRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<ManualGradingAssessmentQuestionRouter>();
