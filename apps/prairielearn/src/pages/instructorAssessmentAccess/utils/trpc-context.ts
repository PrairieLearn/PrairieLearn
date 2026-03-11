import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AccessControlRouter } from '../trpc.js';

const { TRPCProvider, useTRPCClient } = createTRPCContext<AccessControlRouter>();
export { TRPCProvider, useTRPCClient };
