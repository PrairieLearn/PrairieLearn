import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * This rule detects when `event.currentTarget` is accessed inside a nested
 * callback function within a React event handler. This is problematic because
 * React may execute callbacks (like those passed to setState) asynchronously,
 * at which point `currentTarget` may already be nullified.
 *
 * Bad:
 * ```tsx
 * onChange={(e) => setChecks((c) => ({ ...c, value: e.currentTarget.checked }))}
 * ```
 *
 * Good:
 * ```tsx
 * onChange={({ currentTarget }) => setChecks((c) => ({ ...c, value: currentTarget.checked }))}
 * ```
 */
export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      noCurrentTargetInCallback:
        'Accessing event.currentTarget inside a callback may fail because currentTarget can be nullified before the callback runs. Destructure currentTarget at the start of the event handler instead.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    // Track event handler parameters and their scopes
    const eventHandlerParams = new Map<TSESTree.Node, TSESTree.Identifier>();

    /** Check if a node is inside a nested function relative to the event handler */
    function isInsideNestedFunction(
      node: TSESTree.Node,
      eventHandlerFunction: TSESTree.Node,
    ): boolean {
      let current: TSESTree.Node | undefined = node.parent;
      let foundNestedFunction = false;

      while (current && current !== eventHandlerFunction) {
        if (
          current.type === 'ArrowFunctionExpression' ||
          current.type === 'FunctionExpression' ||
          current.type === 'FunctionDeclaration'
        ) {
          foundNestedFunction = true;
        }
        current = current.parent;
      }

      return foundNestedFunction && current === eventHandlerFunction;
    }

    /** Find the function that contains this node */
    function findContainingFunction(
      node: TSESTree.Node,
    ): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        if (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') {
          return current;
        }
        current = current.parent;
      }

      return null;
    }

    /** Check if a function is a JSX event handler */
    function isJSXEventHandler(
      func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): boolean {
      const parent = func.parent;

      // Check for JSX attribute like onChange={...}
      if (parent?.type === 'JSXExpressionContainer') {
        const jsxAttribute = parent.parent;
        if (jsxAttribute?.type === 'JSXAttribute') {
          const attrName = jsxAttribute.name.type === 'JSXIdentifier' ? jsxAttribute.name.name : '';
          // Match common event handler patterns
          return /^on[A-Z]/.test(attrName);
        }
      }

      return false;
    }

    /** Get the first parameter of an event handler if it looks like an event */
    function getEventParameter(
      func: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): TSESTree.Identifier | null {
      const firstParam = func.params[0];

      if (!firstParam) return null;

      // Simple identifier parameter like (e) => ...
      if (firstParam.type === 'Identifier') {
        return firstParam;
      }

      return null;
    }

    return {
      // When we enter a JSX event handler, track its event parameter
      'JSXAttribute > JSXExpressionContainer > ArrowFunctionExpression': (
        node: TSESTree.ArrowFunctionExpression,
      ) => {
        if (isJSXEventHandler(node)) {
          const eventParam = getEventParameter(node);
          if (eventParam) {
            eventHandlerParams.set(node, eventParam);
          }
        }
      },
      'JSXAttribute > JSXExpressionContainer > FunctionExpression': (
        node: TSESTree.FunctionExpression,
      ) => {
        if (isJSXEventHandler(node)) {
          const eventParam = getEventParameter(node);
          if (eventParam) {
            eventHandlerParams.set(node, eventParam);
          }
        }
      },

      // Check for .currentTarget access
      MemberExpression(node) {
        // Only check for .currentTarget property access
        if (node.property.type !== 'Identifier' || node.property.name !== 'currentTarget') {
          return;
        }

        // Check if the object is an identifier (like `e` in `e.currentTarget`)
        if (node.object.type !== 'Identifier') {
          return;
        }

        const objectName = node.object.name;

        // Find the containing function
        const containingFunction = findContainingFunction(node);
        if (!containingFunction) return;

        // Check each tracked event handler to see if this access is problematic
        for (const [eventHandler, eventParam] of eventHandlerParams) {
          // Check if this is accessing the event parameter
          if (objectName !== eventParam.name) continue;

          // Check if the access is inside a nested function within the event handler
          if (isInsideNestedFunction(node, eventHandler)) {
            context.report({
              node,
              messageId: 'noCurrentTargetInCallback',
            });
            return;
          }
        }
      },

      // Clean up when leaving event handlers
      'JSXAttribute > JSXExpressionContainer > ArrowFunctionExpression:exit': (
        node: TSESTree.ArrowFunctionExpression,
      ) => {
        eventHandlerParams.delete(node);
      },
      'JSXAttribute > JSXExpressionContainer > FunctionExpression:exit': (
        node: TSESTree.FunctionExpression,
      ) => {
        eventHandlerParams.delete(node);
      },
    };
  },
});
