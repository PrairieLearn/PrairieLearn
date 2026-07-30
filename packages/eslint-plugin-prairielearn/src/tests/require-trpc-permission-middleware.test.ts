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
        .use(requireAiGradingFeature)
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
    {
      code: `const list = t.procedure
        .use(requireCoursePermissionEditOrCourseInstancePermissionView)
        .query(async () => {});`,
    },
    // Not a t.procedure chain — should be ignored
    {
      code: 'const fn = somethingElse.query(async () => {});',
    },
    {
      code: 'const fn = otherRouter.procedure.query(async () => {});',
    },
    // Intermediate procedure-base variable: permission middleware on the base
    {
      code: `
        const protectedProcedure = t.procedure.use(requireCoursePermissionOwn);
        const m = protectedProcedure.query(async () => {});
      `,
    },
    // Intermediate procedure-base variable: permission added downstream
    {
      code: `
        const featureProcedure = t.procedure.use(requireAiGradingFeature);
        const m = featureProcedure.use(requireAdministrator).mutation(async () => {});
      `,
    },
    // Imported procedure base — we can't follow across files, so don't fire
    {
      code: `
        import { protectedProcedure } from './foo.js';
        const m = protectedProcedure.query(async () => {});
      `,
      languageOptions: { parserOptions: { sourceType: 'module' } },
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
    // Intermediate procedure-base variable with only a feature gate is still a miss
    {
      code: `
        const featureProcedure = t.procedure.use(requireAiGradingFeature);
        const m = featureProcedure.query(async () => {});
      `,
      errors: [{ messageId: 'missingPermissionMiddleware' }],
    },
    {
      code: `
        const featureProcedure = t.procedure.use(requireAiGradingFeature);
        const m = featureProcedure.input(z.object({})).mutation(async () => {});
      `,
      errors: [{ messageId: 'missingPermissionMiddleware' }],
    },
  ],
});
