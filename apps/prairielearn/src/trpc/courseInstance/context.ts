import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { CourseInstanceRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<CourseInstanceRouter>();
