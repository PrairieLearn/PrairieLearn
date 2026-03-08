import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AccessControlRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AccessControlRouter>();
