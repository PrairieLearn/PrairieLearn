import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { CourseRequestsRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<CourseRequestsRouter>();
