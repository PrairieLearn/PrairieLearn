import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AssessmentRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AssessmentRouter>();
