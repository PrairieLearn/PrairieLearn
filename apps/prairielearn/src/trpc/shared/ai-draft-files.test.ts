import { describe, expectTypeOf, it } from 'vitest';

import type { createContext as createCourseContext } from '../course/init.js';
import type { createContext as createCourseInstanceContext } from '../courseInstance/init.js';

import type { AiDraftFilesContext } from './ai-draft-files.js';

/**
 * `aiDraftFilesRouter` is built from its own tRPC instance and nested into both
 * the `course` and `courseInstance` trees. tRPC's router nesting does not verify
 * that those host contexts satisfy the router's own context, so this asserts it
 * at build time: if either tree stops providing what `AiDraftFilesContext`
 * needs (e.g. a dropped `locals.course` / `locals.authz_data`), this file fails
 * to typecheck.
 */
describe('aiDraftFiles tRPC context', () => {
  it('is satisfied by both the course and courseInstance host trees', () => {
    type HostContext =
      | Awaited<ReturnType<typeof createCourseContext>>
      | Awaited<ReturnType<typeof createCourseInstanceContext>>;
    expectTypeOf<HostContext>().toExtend<AiDraftFilesContext>();
  });
});
