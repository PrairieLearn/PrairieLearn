import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { ManualGradingInstanceQuestionRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<ManualGradingInstanceQuestionRouter>();
