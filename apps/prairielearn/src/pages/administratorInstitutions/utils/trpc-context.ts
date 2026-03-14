import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AdministratorInstitutionsRouter } from '../trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AdministratorInstitutionsRouter>();
