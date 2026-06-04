import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AdministratorRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AdministratorRouter>();
