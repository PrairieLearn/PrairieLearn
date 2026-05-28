import { ASTUtils, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

const { findVariable } = ASTUtils;

/**
 * tRPC procedures must enforce their own authorization via a `require*`
 * permission middleware in the chain.
 * Individual procedures often need stricter permissions than the page they're
 * mounted under (e.g. an Edit-only mutation under a route that allows View).
 * Requiring an explicit permission middleware per procedure makes the
 * authz gate visible at the call site and helps prevent missing permission checks.
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
 * - requireCourseInstancePermissionPreview / View / Edit / Own
 * - Or-combinations of the above, e.g. requireCoursePermissionEditOrCourseInstancePermissionView
 * - requireAdministrator
 *
 * Feature gates like `requireEnhancedAccessControl` and `requireAiGradingFeature`
 * don't count — they must be paired with a permission middleware.
 *
 * The rule follows intermediate procedure-base variables so patterns like
 * `const protected = t.procedure.use(...); ...; protected.query(...)` are
 * checked end-to-end.
 */

// TODO: This list requires manual maintenance. We should consider making feature gates
// not use the `require` prefix, and then we can use a more generic pattern here.
const PERMISSION_MIDDLEWARE_PATTERN =
  /^require(Course|CourseInstance)Permission(Preview|View|Edit|Own)(Or(Course|CourseInstance)Permission(Preview|View|Edit|Own))*$|^requireAdministrator$/;
const TERMINAL_METHODS = new Set(['query', 'mutation', 'subscription']);

function unwrapMemberObject(expr: TSESTree.Expression): TSESTree.Expression {
  return expr.type === 'TSNonNullExpression' || expr.type === 'TSAsExpression'
    ? unwrapMemberObject(expr.expression)
    : expr;
}

function isTProcedure(expr: TSESTree.Expression): boolean {
  return (
    expr.type === 'MemberExpression' &&
    !expr.computed &&
    expr.property.type === 'Identifier' &&
    expr.property.name === 'procedure' &&
    expr.object.type === 'Identifier' &&
    expr.object.name === 't'
  );
}

interface ChainInfo {
  matchesTProcedure: boolean;
  middlewares: string[];
}

/**
 * Walks back through a chain like `expr.use(A).input(B).use(C)` collecting
 * `.use(...)` argument identifiers. If the base of the chain is `t.procedure`,
 * returns the collected middlewares. If the base is a variable, follows the
 * variable's initializer (e.g. `const protected = t.procedure.use(X)`).
 */
function getProcedureChainInfo(
  expr: TSESTree.Expression,
  scope: TSESLint.Scope.Scope,
  visited: Set<TSESTree.Node>,
): ChainInfo {
  if (visited.has(expr)) return { matchesTProcedure: false, middlewares: [] };
  visited.add(expr);

  const middlewares: string[] = [];
  let cursor: TSESTree.Expression = expr;

  while (cursor.type === 'CallExpression') {
    const callee = cursor.callee;
    if (
      callee.type !== 'MemberExpression' ||
      callee.computed ||
      callee.property.type !== 'Identifier'
    ) {
      return { matchesTProcedure: false, middlewares: [] };
    }
    if (callee.property.name === 'use' && cursor.arguments[0]?.type === 'Identifier') {
      middlewares.push(cursor.arguments[0].name);
    }
    cursor = callee.object;
  }

  cursor = unwrapMemberObject(cursor);

  if (isTProcedure(cursor)) {
    return { matchesTProcedure: true, middlewares };
  }

  // Follow an intermediate procedure-base variable defined in the same module:
  //   const protectedProcedure = t.procedure.use(...);
  //   protectedProcedure.query(...);
  if (cursor.type === 'Identifier') {
    const variable = findVariable(scope, cursor);
    if (variable && variable.defs.length === 1) {
      const def = variable.defs[0];
      if (
        def.node.type === 'VariableDeclarator' &&
        def.node.init &&
        // Conservative: only follow `const` bindings to avoid stale data
        // from let/var rebinding.
        def.parent?.type === 'VariableDeclaration' &&
        def.parent.kind === 'const'
      ) {
        const upstream = getProcedureChainInfo(def.node.init, scope, visited);
        if (upstream.matchesTProcedure) {
          return {
            matchesTProcedure: true,
            middlewares: [...middlewares, ...upstream.middlewares],
          };
        }
      }
    }
  }

  return { matchesTProcedure: false, middlewares: [] };
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

        const scope = context.sourceCode.getScope(node);
        const info = getProcedureChainInfo(node.callee.object, scope, new Set());

        if (!info.matchesTProcedure) return;

        const hasPermissionGate = info.middlewares.some((name) =>
          PERMISSION_MIDDLEWARE_PATTERN.test(name),
        );
        if (!hasPermissionGate) {
          context.report({ node, messageId: 'missingPermissionMiddleware' });
        }
      },
    };
  },
});
