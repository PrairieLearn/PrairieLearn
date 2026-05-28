import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { CourseRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<CourseRouter>();
