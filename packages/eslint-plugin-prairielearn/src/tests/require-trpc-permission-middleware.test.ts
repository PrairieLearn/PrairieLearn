import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import rule from '../rules/require-trpc-permission-middleware.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('require-trpc-permission-middleware', rule, {
  valid: [
    {
      code: 'const list = t.procedure.use(requireCoursePermissionEdit).query(async () => {});',
    },
    {
      code: 'const m = t.procedure.use(requireCoursePermissionPreview).mutation(async () => {});',
    },
    {
      code: `const m = t.procedure
        .use(requireEnhancedAccessControl)
        .use(requireCourseInstancePermissionView)
        .query(async () => {});`,
    },
    {
      code: 'const m = t.procedure.use(requireAdministrator).mutation(async () => {});',
    },
    {
      code: `const m = t.procedure
        .use(requireCourseInstancePermissionEdit)
        .input(z.object({}))
        .mutation(async () => {});`,
    },
    {
      code: 'const list = t.procedure.use(requireCoursePermissionOwn).query(async () => {});',
    },
    // Not a t.procedure chain — should be ignored
    {
      code: 'const fn = somethingElse.query(async () => {});',
    },
    {
      code: 'const fn = otherRouter.procedure.query(async () => {});',
    },
  ],
  invalid: [
    {
      code: 'const list = t.procedure.query(async () => {});',
      errors: [{ messageId: 'missingPermissionMiddleware' }],
    },
    {
      code: 'const m = t.procedure.input(z.object({})).mutation(async () => {});',
      errors: [{ messageId: 'missingPermissionMiddleware' }],
    },
    // Feature gate alone is not a permission gate
    {
      code: 'const m = t.procedure.use(requireEnhancedAccessControl).mutation(async () => {});',
      errors: [{ messageId: 'missingPermissionMiddleware' }],
    },
    {
      code: 'const m = t.procedure.use(requireAiGradingFeature).mutation(async () => {});',
      errors: [{ messageId: 'missingPermissionMiddleware' }],
    },
    {
      code: `const m = t.procedure
        .input(z.object({}))
        .output(z.object({}))
        .subscription(async () => {});`,
      errors: [{ messageId: 'missingPermissionMiddleware' }],
    },
  ],
});
