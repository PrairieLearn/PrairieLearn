import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AssessmentQuestionRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AssessmentQuestionRouter>();
