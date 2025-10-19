import { ESLintUtils } from '@typescript-eslint/utils';

/**
 * This rule will report things that look like template string interpolations
 * that were improperly converted to JSX. For example, the following code will
 * trigger an error:
 *
 * ```tsx
 * const a = <div>${message}</div>;
 * const b = <div>$ {message}</div>;
 * ```
 */
export default ESLintUtils.RuleCreator.withoutDocs({
  name: 'jsx-no-dollar-interpolation',
  meta: {
    type: 'problem',
    messages: {
      dollarInterpolationNotAllowed: 'Interpolation with a dollar sign is not allowed in JSX.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      JSXElement(node) {
        node.children.forEach((child, index) => {
          // Skip the first child since it can't be preceded by a JSXText node.
          if (index === 0) return;

          // Skip anything that's not a JSXExpressionContainer.
          if (child.type !== 'JSXExpressionContainer') return;

          const previousChild = node.children[index - 1];

          // Skip nodes that aren't preceded by a JSXText node.
          if (previousChild.type !== 'JSXText') return;

          // Skip nodes that aren't preceded by a dollar sign.
          if (!previousChild.value.trimEnd().endsWith('$')) return;

          // Determine the range of characters that should be reported. We
          // include the dollar sign, any following whitespace, and the
          // expression container.
          const start = context.sourceCode.getIndexFromLoc(previousChild.loc.start);
          const lastIndex = previousChild.value.lastIndexOf('$');
          const dollarStart = start + lastIndex;
          const dollarStartLoc = context.sourceCode.getLocFromIndex(dollarStart);

          context.report({
            node,
            loc: {
              start: dollarStartLoc,
              end: child.loc.end,
            },
            messageId: 'dollarInterpolationNotAllowed',
          });
        });
      },
    };
  },
});
