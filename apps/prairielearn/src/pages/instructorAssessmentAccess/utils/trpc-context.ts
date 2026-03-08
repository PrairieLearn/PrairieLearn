import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AccessControlRouter } from '../trpc.js';

const { TRPCProvider, useTRPC: _useTRPC, useTRPCClient } = createTRPCContext<AccessControlRouter>();
export { TRPCProvider, useTRPCClient };
