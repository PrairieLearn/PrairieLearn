import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AiGradingSettingsRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AiGradingSettingsRouter>();
