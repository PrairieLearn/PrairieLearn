import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { AdministratorRouter } from '../../../trpc/administrator/index.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AdministratorRouter>();
