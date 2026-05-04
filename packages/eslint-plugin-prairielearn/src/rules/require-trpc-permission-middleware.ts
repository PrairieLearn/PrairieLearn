import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * tRPC procedures must enforce their own authorization via a `require*`
 * permission middleware in the chain. Page-level Express middleware skips
 * tRPC requests (so HTML error pages don't break JSON clients), so the
 * procedure is the only authz gate.
 *
 * Bad:
 * ```ts
 * const list = t.procedure.query(async ({ ctx }) => { ... });
 * ```
 *
 * Good:
 * ```ts
 * const list = t.procedure.use(requireCoursePermissionEdit).query(...);
 * ```
 *
 * Recognized permission middlewares:
 * - requireCoursePermissionPreview / View / Edit / Own
 * - requireCourseInstancePermissionView / Edit
 * - requireAdministrator
 *
 * Feature gates like `requireEnhancedAccessControl` and `requireAiGradingFeature`
 * don't count — they must be paired with a permission middleware.
 */

// TODO: This list requires manual maintenance. We should consider making feature gates
// not use the `require` prefix, and then we can use a more generic pattern here.
const PERMISSION_MIDDLEWARE_PATTERN =
  /^require(Course|CourseInstance)Permission(Preview|View|Edit|Own)$|^requireAdministrator$/;
const TERMINAL_METHODS = new Set(['query', 'mutation', 'subscription']);

function unwrapMemberObject(expr: TSESTree.Expression): TSESTree.Expression {
  return expr.type === 'TSNonNullExpression' || expr.type === 'TSAsExpression'
    ? unwrapMemberObject(expr.expression)
    : expr;
}

function isTProcedure(expr: TSESTree.Expression): boolean {
  const unwrapped = unwrapMemberObject(expr);
  return (
    unwrapped.type === 'MemberExpression' &&
    !unwrapped.computed &&
    unwrapped.property.type === 'Identifier' &&
    unwrapped.property.name === 'procedure' &&
    unwrapped.object.type === 'Identifier' &&
    unwrapped.object.name === 't'
  );
}

export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      missingPermissionMiddleware:
        'tRPC procedure must call .use() with a permission middleware (e.g. requireCoursePermissionEdit)',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.computed ||
          node.callee.property.type !== 'Identifier' ||
          !TERMINAL_METHODS.has(node.callee.property.name)
        ) {
          return;
        }

        const usedMiddlewares: string[] = [];
        let cursor: TSESTree.Expression = node.callee.object;

        while (cursor.type === 'CallExpression') {
          const callee = cursor.callee;
          if (
            callee.type !== 'MemberExpression' ||
            callee.computed ||
            callee.property.type !== 'Identifier'
          ) {
            return;
          }
          if (callee.property.name === 'use' && cursor.arguments[0]?.type === 'Identifier') {
            usedMiddlewares.push(cursor.arguments[0].name);
          }
          cursor = callee.object;
        }

        if (!isTProcedure(cursor)) return;

        const hasPermissionGate = usedMiddlewares.some((name) =>
          PERMISSION_MIDDLEWARE_PATTERN.test(name),
        );
        if (!hasPermissionGate) {
          context.report({ node, messageId: 'missingPermissionMiddleware' });
        }
      },
    };
  },
});
