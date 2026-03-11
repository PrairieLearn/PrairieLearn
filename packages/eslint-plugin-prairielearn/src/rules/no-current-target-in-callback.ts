import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/**
 * This rule detects when `event.currentTarget` is accessed after an `await` or
 * inside a callback passed to a likely deferred API within a React event
 * handler. Those callbacks may run after the handler returns, at which point
 * `currentTarget` may already be nullified.
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
        'Accessing event.currentTarget after an async boundary may fail because currentTarget can be nullified before the access runs. Destructure currentTarget at the start of the event handler instead.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    const trackedEventFunctions = new Map<TSESTree.Node, TSESTree.Identifier>();
    const visitorKeys = context.sourceCode.visitorKeys;

    function isFunctionLike(
      node: TSESTree.Node,
    ): node is
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionExpression
      | TSESTree.FunctionDeclaration {
      return (
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration'
      );
    }

    function isNode(value: unknown): value is TSESTree.Node {
      return typeof value === 'object' && value !== null && 'type' in value;
    }

    function getChildNodes(node: TSESTree.Node): TSESTree.Node[] {
      const children: TSESTree.Node[] = [];

      for (const key of visitorKeys[node.type] ?? []) {
        const value: unknown = node[key as keyof TSESTree.Node];

        if (Array.isArray(value)) {
          for (const child of value) {
            if (isNode(child)) {
              children.push(child);
            }
          }
        } else if (isNode(value)) {
          children.push(value);
        }
      }

      return children;
    }

    function isKnownDeferredCallee(callee: TSESTree.Expression | TSESTree.Super): boolean {
      if (callee.type === 'Super') {
        return false;
      }

      if (callee.type === 'Identifier') {
        return (
          // e.g. setTimeout, setInterval, setImmediate, etc.
          /^set[A-Z0-9_]/.test(callee.name) ||
          callee.name === 'queueMicrotask' ||
          callee.name === 'requestAnimationFrame' ||
          callee.name === 'requestIdleCallback' ||
          callee.name === 'startTransition'
        );
      }

      if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        return (
          callee.property.name === 'then' ||
          callee.property.name === 'catch' ||
          callee.property.name === 'finally'
        );
      }

      return false;
    }

    function isKnownEventBoundaryCallback(
      callExpression: TSESTree.CallExpression,
      callbackIndex: number,
    ): boolean {
      if (callbackIndex !== 0) {
        return false;
      }

      if (
        callExpression.callee.type === 'Identifier' &&
        callExpression.callee.name === 'handleSubmit'
      ) {
        // react-hook-form invokes this callback after its own submit handling,
        // so treat it as an event boundary like other deferred callbacks.
        return true;
      }

      return false;
    }

    /**
     * Check if a node is inside a nested function that is passed to a callback
     * API that may invoke it after the event handler returns.
     */
    function isInsideDeferredCallback(
      node: TSESTree.Node,
      eventHandlerFunction: TSESTree.Node,
    ): boolean {
      let current: TSESTree.Node | undefined = node;

      while (current && current !== eventHandlerFunction) {
        if (isFunctionLike(current)) {
          const parent = current.parent;
          if (current.type !== 'FunctionDeclaration' && parent?.type === 'CallExpression') {
            const callbackIndex = parent.arguments.indexOf(current);
            if (
              callbackIndex !== -1 &&
              (isKnownDeferredCallee(parent.callee) ||
                isKnownEventBoundaryCallback(parent, callbackIndex))
            ) {
              return true;
            }
          }
        }
        current = current.parent;
      }

      return false;
    }

    /** Check if the function contains an await before this access, ignoring nested functions */
    function hasPriorAwaitInSameFunction(
      node: TSESTree.Node,
      eventHandlerFunction: TSESTree.Node,
    ): boolean {
      if (
        !('body' in eventHandlerFunction) ||
        !eventHandlerFunction.body ||
        Array.isArray(eventHandlerFunction.body)
      ) {
        return false;
      }

      let foundPriorAwait = false;

      const visit = (current: TSESTree.Node) => {
        if (foundPriorAwait || current.range[0] >= node.range[0]) {
          return;
        }

        if (current !== eventHandlerFunction && isFunctionLike(current)) {
          return;
        }

        if (current.type === 'AwaitExpression') {
          foundPriorAwait = true;
          return;
        }

        for (const child of getChildNodes(current)) {
          visit(child);
          if (foundPriorAwait) {
            return;
          }
        }
      };

      visit(eventHandlerFunction.body);
      return foundPriorAwait;
    }

    /** Find the function that contains this node */
    function findContainingFunction(
      node: TSESTree.Node,
    ):
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionExpression
      | TSESTree.FunctionDeclaration
      | null {
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        if (isFunctionLike(current)) {
          return current;
        }
        current = current.parent;
      }

      return null;
    }

    /** Check if a function is a JSX event handler */
    function isJSXEventHandler(
      func:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
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
      func:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
    ): TSESTree.Identifier | null {
      const firstParam = func.params[0];

      if (!firstParam) return null;

      // Simple identifier parameter like (e) => ...
      if (firstParam.type === 'Identifier') {
        return firstParam;
      }

      return null;
    }

    function isReactEventType(typeAnnotation: TSESTree.TypeNode): boolean {
      if (typeAnnotation.type === 'TSTypeReference') {
        if (
          typeAnnotation.typeName.type === 'TSQualifiedName' &&
          typeAnnotation.typeName.left.type === 'Identifier' &&
          typeAnnotation.typeName.left.name === 'React' &&
          typeAnnotation.typeName.right.type === 'Identifier' &&
          typeAnnotation.typeName.right.name.endsWith('Event')
        ) {
          return true;
        }

        if (
          typeAnnotation.typeName.type === 'Identifier' &&
          (typeAnnotation.typeName.name === 'SyntheticEvent' ||
            typeAnnotation.typeName.name.endsWith('Event'))
        ) {
          return true;
        }
      }

      return false;
    }

    function isTypedReactEventHandler(
      func:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
    ): boolean {
      const firstParam = func.params[0];
      if (!firstParam || firstParam.type !== 'Identifier' || !firstParam.typeAnnotation) {
        return false;
      }

      return isReactEventType(firstParam.typeAnnotation.typeAnnotation);
    }

    function trackIfEventHandler(
      node:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
    ) {
      if (!isJSXEventHandler(node) && !isTypedReactEventHandler(node)) {
        return;
      }

      const eventParam = getEventParameter(node);
      if (eventParam) {
        trackedEventFunctions.set(node, eventParam);
      }
    }

    return {
      // When we enter a JSX event handler, track its event parameter
      'JSXAttribute > JSXExpressionContainer > ArrowFunctionExpression': (
        node: TSESTree.ArrowFunctionExpression,
      ) => {
        trackIfEventHandler(node);
      },
      'JSXAttribute > JSXExpressionContainer > FunctionExpression': (
        node: TSESTree.FunctionExpression,
      ) => {
        trackIfEventHandler(node);
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        trackIfEventHandler(node);
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        trackIfEventHandler(node);
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        trackIfEventHandler(node);
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
        for (const [eventHandler, eventParam] of trackedEventFunctions) {
          // Check if this is accessing the event parameter
          if (objectName !== eventParam.name) continue;

          if (
            isInsideDeferredCallback(node, eventHandler) ||
            hasPriorAwaitInSameFunction(node, eventHandler)
          ) {
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
        trackedEventFunctions.delete(node);
      },
      'JSXAttribute > JSXExpressionContainer > FunctionExpression:exit': (
        node: TSESTree.FunctionExpression,
      ) => {
        trackedEventFunctions.delete(node);
      },
      'ArrowFunctionExpression:exit'(node: TSESTree.ArrowFunctionExpression) {
        trackedEventFunctions.delete(node);
      },
      'FunctionExpression:exit'(node: TSESTree.FunctionExpression) {
        trackedEventFunctions.delete(node);
      },
      'FunctionDeclaration:exit'(node: TSESTree.FunctionDeclaration) {
        trackedEventFunctions.delete(node);
      },
    };
  },
});
