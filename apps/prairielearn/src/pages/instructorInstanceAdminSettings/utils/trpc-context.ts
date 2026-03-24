import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { SettingsRouter } from '../trpc.js';

const { TRPCProvider, useTRPC } = createTRPCContext<SettingsRouter>();
export { TRPCProvider, useTRPC };
