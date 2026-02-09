import type { AnyTRPCRouter } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';

export function createPageTRPC<TRouter extends AnyTRPCRouter>() {
  return createTRPCContext<TRouter>();
}
