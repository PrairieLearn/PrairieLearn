import { describe, expectTypeOf, it } from 'vitest';

import type { createContext as createCourseContext } from '../course/init.js';

import type { AiDraftFilesContext } from './ai-draft-files.js';

/**
 * `aiDraftFilesRouter` is built from its own tRPC instance and nested into the
 * `course` tree. tRPC's router nesting does not verify that the host context
 * satisfies the router's own context, so this asserts it at build time: if the
 * course tree stops providing what `AiDraftFilesContext` needs (e.g. a dropped
 * `locals.course` / `locals.authz_data`), this file fails to typecheck.
 */
describe('aiDraftFiles tRPC context', () => {
  it('is satisfied by the course host tree', () => {
    type HostContext = Awaited<ReturnType<typeof createCourseContext>>;
    expectTypeOf<HostContext>().toExtend<AiDraftFilesContext>();
  });
});
