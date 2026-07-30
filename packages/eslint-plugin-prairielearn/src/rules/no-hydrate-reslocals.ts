import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * All props on a hydrated component are serialized with superjson and shipped
 * to the browser. Passing `resLocals` or `locals` (or spreading them) would
 * leak the entire server-side `res.locals` object — CSRF tokens, auth data,
 * authz objects, full DB rows, etc.
 *
 * This rule forbids those prop names (and `{...res.locals}` / `{...resLocals}`
 * / `{...locals}` spreads) on the child of `<Hydrate>` and on the JSX argument
 * to `hydrateHtml(...)`. Extract the specific fields you need (e.g. via
 * `extractPageContext`) and pass them as individual props instead.
 */

const HYDRATE_COMPONENT_NAME = 'Hydrate';
const HYDRATE_FUNCTION_NAME = 'hydrateHtml';
const FORBIDDEN_NAMES = new Set(['resLocals', 'locals']);

function extractSingleJsxChild(children: TSESTree.JSXChild[]): TSESTree.JSXElement | null {
  const nonWhitespace = children.filter((child) => {
    if (child.type === 'JSXText') return child.value.trim().length > 0;
    return true;
  });
  if (nonWhitespace.length !== 1 || nonWhitespace[0].type !== 'JSXElement') {
    return null;
  }
  return nonWhitespace[0];
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
        'Do not pass "{{name}}" to a hydrated component; props are serialized and sent to the client, so this would leak the full server-side res.locals. Pass the specific fields the component needs instead.',
      forbiddenSpread:
        'Do not spread res.locals onto a hydrated component; props are serialized and sent to the client. Pass the specific fields the component needs instead.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    function checkHydratedElement(element: TSESTree.JSXElement) {
      for (const attribute of element.openingElement.attributes) {
        if (attribute.type === 'JSXAttribute') {
          if (attribute.name.type === 'JSXIdentifier' && FORBIDDEN_NAMES.has(attribute.name.name)) {
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
    }

    return {
      JSXElement(node) {
        const opening = node.openingElement.name;
        if (opening.type !== 'JSXIdentifier' || opening.name !== HYDRATE_COMPONENT_NAME) return;

        const child = extractSingleJsxChild(node.children);
        if (!child) return;

        checkHydratedElement(child);
      },

      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== HYDRATE_FUNCTION_NAME) return;
        if (node.arguments.length === 0) return;

        const arg = node.arguments[0];
        if (arg.type !== 'JSXElement') return;

        checkHydratedElement(arg);
      },
    };
  },
});
