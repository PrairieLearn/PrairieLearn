import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { InstructorQuestionsRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<InstructorQuestionsRouter>();
