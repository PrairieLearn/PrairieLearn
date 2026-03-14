import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { PublicQuestionsRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<PublicQuestionsRouter>();
