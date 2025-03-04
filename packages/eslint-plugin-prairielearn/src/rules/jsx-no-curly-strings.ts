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
  meta: {
    type: 'problem',
    messages: {
      curlyStringNotAllowed: 'Curly strings are not allowed in JSX.',
      curlyStringSuspect: 'This may be an improperly formatted string interpolation.',
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

          const start = context.sourceCode.getIndexFromLoc(previousChild.loc.start);
          const lastIndex = previousChild.value.lastIndexOf('$');
          const dollarStart = start + lastIndex;
          const dollarStartLoc = context.sourceCode.getLocFromIndex(dollarStart);

          if (previousChild.value.endsWith('$')) {
            // Handle unambiguous cases where the dollar sign is adjacent to the curly braces.
            context.report({
              node,
              loc: {
                start: dollarStartLoc,
                end: child.loc.end,
              },
              messageId: 'curlyStringNotAllowed',
            });
          } else if (previousChild.value.trimEnd().endsWith('$')) {
            // Handle ambiguous cases where the dollar sign is not adjacent to the curly braces,
            // which may be the case if Prettier has formatted the code.
            context.report({
              node,
              loc: {
                start: dollarStartLoc,
                end: child.loc.end,
              },
              messageId: 'curlyStringSuspect',
            });
          }
        });
      },
    };
  },
});
