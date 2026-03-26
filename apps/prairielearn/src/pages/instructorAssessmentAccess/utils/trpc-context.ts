import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AccessControlRouter } from '../trpc.js';

const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AccessControlRouter>();
export { TRPCProvider, useTRPC, useTRPCClient };
