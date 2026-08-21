import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { UserRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<UserRouter>();
