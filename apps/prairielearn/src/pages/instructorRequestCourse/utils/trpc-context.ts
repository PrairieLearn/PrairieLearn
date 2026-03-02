import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { InstructorRequestCourseRouter } from './trpc.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<InstructorRequestCourseRouter>();
