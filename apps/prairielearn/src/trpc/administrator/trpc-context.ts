import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AdministratorRouter } from '../../trpc/administrator/trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AdministratorRouter>();
