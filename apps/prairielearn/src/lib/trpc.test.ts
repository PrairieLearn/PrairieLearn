import { initTRPC } from '@trpc/server';
import { describe, expect, test } from 'vitest';

import { getRouterPaths } from './trpc.js';

const t = initTRPC.create();

describe('getRouterPaths', () => {
  test('returns paths for flat router', () => {
    const router = t.router({
      foo: t.procedure.query(() => 'foo'),
      bar: t.procedure.mutation(() => 'bar'),
    });

    expect(getRouterPaths(router).sort()).toEqual(['bar', 'foo']);
  });

  test('returns dot-separated paths for nested routers', () => {
    const child = t.router({
      alpha: t.procedure.query(() => 'a'),
      beta: t.procedure.query(() => 'b'),
    });
    const router = t.router({
      parent: child,
    });

    expect(getRouterPaths(router).sort()).toEqual(['parent.alpha', 'parent.beta']);
  });

  test('returns paths for deeply nested routers', () => {
    const grandchild = t.router({
      leaf: t.procedure.query(() => 'leaf'),
    });
    const child = t.router({
      grandchild,
    });
    const router = t.router({
      child,
    });

    expect(getRouterPaths(router)).toEqual(['child.grandchild.leaf']);
  });

  test('returns paths for mixed flat and nested procedures', () => {
    const child = t.router({
      nested: t.procedure.query(() => 'nested'),
    });
    const router = t.router({
      top: t.procedure.query(() => 'top'),
      child,
    });

    expect(getRouterPaths(router).sort()).toEqual(['child.nested', 'top']);
  });

  test('returns empty array for empty router', () => {
    const router = t.router({});

    expect(getRouterPaths(router)).toEqual([]);
  });
});
