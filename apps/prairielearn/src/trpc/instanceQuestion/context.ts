import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { InstanceQuestionRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<InstanceQuestionRouter>();
