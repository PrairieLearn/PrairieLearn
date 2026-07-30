import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AdminCreditPoolRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AdminCreditPoolRouter>();
