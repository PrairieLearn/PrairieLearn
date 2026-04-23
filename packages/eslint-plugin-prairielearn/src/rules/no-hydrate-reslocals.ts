import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * All props on the child of a `<Hydrate>` element are serialized with
 * superjson and shipped to the browser. Passing `resLocals` or `locals`
 * (or spreading them) would leak the entire server-side `res.locals`
 * object — CSRF tokens, auth data, authz objects, full DB rows, etc.
 *
 * This rule forbids those specific prop names, and forbids spreads on a
 * `<Hydrate>` child whose spread argument is `res.locals`, `resLocals`,
 * or `locals`. Extract the specific fields you need (e.g. via
 * `extractPageContext`) and pass them as individual props instead.
 */

const FORBIDDEN_NAMES = new Set(['resLocals', 'locals']);

function isHydrateElement(node: TSESTree.JSXElement): boolean {
  const opening = node.openingElement;
  return opening.name.type === 'JSXIdentifier' && opening.name.name === 'Hydrate';
}

function getHydrateChildElement(node: TSESTree.JSXElement): TSESTree.JSXElement | null {
  for (const child of node.children) {
    if (child.type === 'JSXElement') {
      return child;
    }
  }
  return null;
}

function spreadArgumentDescribesResLocals(argument: TSESTree.Expression): boolean {
  if (argument.type === 'Identifier') {
    return FORBIDDEN_NAMES.has(argument.name);
  }
  if (
    argument.type === 'MemberExpression' &&
    !argument.computed &&
    argument.property.type === 'Identifier' &&
    argument.property.name === 'locals'
  ) {
    return true;
  }
  return false;
}

export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      forbiddenProp:
        'Do not pass "{{name}}" to a component rendered inside <Hydrate>; props are serialized and sent to the client, so this would leak the full server-side res.locals. Pass the specific fields the component needs instead.',
      forbiddenSpread:
        'Do not spread res.locals onto a component rendered inside <Hydrate>; props are serialized and sent to the client. Pass the specific fields the component needs instead.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      JSXElement(node) {
        if (!isHydrateElement(node)) return;

        const child = getHydrateChildElement(node);
        if (!child) return;

        for (const attribute of child.openingElement.attributes) {
          if (attribute.type === 'JSXAttribute') {
            if (
              attribute.name.type === 'JSXIdentifier' &&
              FORBIDDEN_NAMES.has(attribute.name.name)
            ) {
              context.report({
                node: attribute,
                messageId: 'forbiddenProp',
                data: { name: attribute.name.name },
              });
            }
          } else if (attribute.type === 'JSXSpreadAttribute') {
            if (spreadArgumentDescribesResLocals(attribute.argument)) {
              context.report({
                node: attribute,
                messageId: 'forbiddenSpread',
              });
            }
          }
        }
      },
    };
  },
});
