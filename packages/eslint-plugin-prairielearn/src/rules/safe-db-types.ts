import { type TSESTree } from '@typescript-eslint/types';
import { ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

const HYDRATE_FUNCTION_NAME = 'hydrateHtml';
const HYDRATE_COMPONENT_NAME = 'Hydrate';

/**
 * Check if a variable declaration is a Zod schema that uses schemas from db-types.ts
 * For example: const RubricDataSchema = RubricSchema.extend({...})
 */
function checkZodSchemaForDbTypes(
  declaration: ts.VariableDeclaration,
  typeChecker: ts.TypeChecker,
): string[] {
  const violations: string[] = [];

  if (!declaration.initializer) return violations;

  // Walk the expression tree to find all identifiers
  const findIdentifiers = (node: ts.Node): void => {
    // Check property access expressions like RubricSchema.extend() or InstanceQuestionSchema.shape
    if (ts.isPropertyAccessExpression(node)) {
      const objectSymbol = typeChecker.getSymbolAtLocation(node.expression);
      if (objectSymbol) {
        const aliasedSymbol =
          objectSymbol.flags & ts.SymbolFlags.Alias
            ? typeChecker.getAliasedSymbol(objectSymbol)
            : objectSymbol;
        const decls = aliasedSymbol.getDeclarations();
        if (decls && decls.length > 0) {
          const sourceFile = decls[0].getSourceFile();
          if (sourceFile.fileName.endsWith('/db-types.ts')) {
            violations.push(aliasedSymbol.getName());
          }
        }
      }
    }

    // Check spread elements in object literals (e.g., ...SomeSchema.shape)
    if (ts.isSpreadAssignment(node)) {
      // The expression being spread (e.g., SomeSchema.shape)
      const spreadExpr = node.expression;

      // Check if it's a property access (e.g., accessing .shape)
      if (ts.isPropertyAccessExpression(spreadExpr)) {
        const objectSymbol = typeChecker.getSymbolAtLocation(spreadExpr.expression);
        if (objectSymbol) {
          const aliasedSymbol =
            objectSymbol.flags & ts.SymbolFlags.Alias
              ? typeChecker.getAliasedSymbol(objectSymbol)
              : objectSymbol;
          const decls = aliasedSymbol.getDeclarations();
          if (decls && decls.length > 0) {
            const sourceFile = decls[0].getSourceFile();
            if (sourceFile.fileName.endsWith('/db-types.ts')) {
              violations.push(aliasedSymbol.getName());
            } else {
              // The schema is defined locally, check if IT uses db-types
              for (const decl of decls) {
                if (ts.isVariableDeclaration(decl)) {
                  // Recursively check the local schema
                  const nestedViolations = checkZodSchemaForDbTypes(decl, typeChecker);
                  violations.push(...nestedViolations);
                }
              }
            }
          }
        }
      }
      // Also check if the spread is a direct identifier (e.g., ...someObject)
      else if (ts.isIdentifier(spreadExpr)) {
        const spreadSymbol = typeChecker.getSymbolAtLocation(spreadExpr);
        if (spreadSymbol) {
          const aliasedSymbol =
            spreadSymbol.flags & ts.SymbolFlags.Alias
              ? typeChecker.getAliasedSymbol(spreadSymbol)
              : spreadSymbol;
          const decls = aliasedSymbol.getDeclarations();
          if (decls && decls.length > 0) {
            const sourceFile = decls[0].getSourceFile();
            if (sourceFile.fileName.endsWith('/db-types.ts')) {
              violations.push(aliasedSymbol.getName());
            }
          }
        }
      }
    }

    // Check call expressions for arguments
    if (ts.isCallExpression(node)) {
      for (const arg of node.arguments) {
        // Check if argument is an identifier (e.g., RubricItemSchema)
        if (ts.isIdentifier(arg)) {
          const argSymbol = typeChecker.getSymbolAtLocation(arg);
          if (argSymbol) {
            const aliasedSymbol =
              argSymbol.flags & ts.SymbolFlags.Alias
                ? typeChecker.getAliasedSymbol(argSymbol)
                : argSymbol;
            const decls = aliasedSymbol.getDeclarations();
            if (decls && decls.length > 0) {
              const sourceFile = decls[0].getSourceFile();
              if (sourceFile.fileName.endsWith('/db-types.ts')) {
                violations.push(aliasedSymbol.getName());
              }
            }
          }
        }
      }
    }

    // Check object literal property assignments (e.g., { rubric: RubricSchema })
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.initializer)) {
      const identifier = node.initializer;
      const symbol = typeChecker.getSymbolAtLocation(identifier);
      if (symbol) {
        const aliasedSymbol =
          symbol.flags & ts.SymbolFlags.Alias ? typeChecker.getAliasedSymbol(symbol) : symbol;
        const decls = aliasedSymbol.getDeclarations();
        if (decls && decls.length > 0) {
          const sourceFile = decls[0].getSourceFile();
          if (sourceFile.fileName.endsWith('/db-types.ts')) {
            violations.push(aliasedSymbol.getName());
          }
        }
      }
    }

    ts.forEachChild(node, findIdentifiers);
  };

  findIdentifiers(declaration.initializer);
  return violations;
}

/**
 * Check if a type node is z.infer<typeof SchemaName> and if SchemaName uses db-types
 * Returns the names of db-types that the schema depends on
 */
function checkForZodInferPattern(typeNode: ts.TypeNode, typeChecker: ts.TypeChecker): string[] {
  // Check if this is a type reference with type arguments
  if (!ts.isTypeReferenceNode(typeNode)) return [];

  // Check if the type reference is named (e.g., "infer" from z.infer)
  const typeName = typeNode.typeName;
  if (!ts.isQualifiedName(typeName)) return [];

  // Check if it's z.infer or similar pattern
  // The pattern is: z.infer<typeof SchemaName>
  const typeArgs = typeNode.typeArguments;
  if (!typeArgs || typeArgs.length !== 1) return [];

  const typeArg = typeArgs[0];

  // Check if the type argument is a typeof expression
  if (!ts.isTypeQueryNode(typeArg)) return [];

  // Get the schema name from typeof X
  const exprName = typeArg.exprName;
  if (!ts.isIdentifier(exprName)) return [];

  // Now find the schema variable declaration
  const schemaSymbol = typeChecker.getSymbolAtLocation(exprName);
  if (!schemaSymbol) return [];

  // Check if this is an imported symbol (alias) - follow it to the original
  const symbolToCheck =
    schemaSymbol.flags & ts.SymbolFlags.Alias
      ? typeChecker.getAliasedSymbol(schemaSymbol)
      : schemaSymbol;

  const schemaDecls = symbolToCheck.getDeclarations();
  if (!schemaDecls || schemaDecls.length === 0) return [];

  // Check if it's a variable declaration
  for (const decl of schemaDecls) {
    if (ts.isVariableDeclaration(decl)) {
      // If the schema is defined in safe-db-types.ts, it's safe by definition
      const sourceFile = decl.getSourceFile();
      if (sourceFile.fileName.endsWith('/safe-db-types.ts')) {
        return [];
      }

      // Use our existing helper to check if the schema uses db-types
      return checkZodSchemaForDbTypes(decl, typeChecker);
    }
  }

  return [];
}

function extractChild(children: TSESTree.JSXChild[]): TSESTree.JSXElement | null {
  const nonWhitespaceChildren = children.filter((child) => {
    if (child.type === 'JSXText') {
      return child.value.trim().length > 0;
    }
    return true;
  });

  if (nonWhitespaceChildren.length !== 1 || nonWhitespaceChildren[0].type !== 'JSXElement') {
    return null;
  }

  return nonWhitespaceChildren[0];
}

/**
 * Check if a TypeScript type node references a type from db-types.ts
 * This checks the actual source code type annotation, not the resolved type.
 * Follows type aliases (imports) to their original declaration.
 * Returns all unsafe type names found.
 */
function checkTypeNodeForDbTypes(
  typeNode: ts.TypeNode,
  typeChecker: ts.TypeChecker,
  visited = new Set<ts.TypeNode>(),
): string[] {
  if (visited.has(typeNode)) return [];
  visited.add(typeNode);

  const violations: string[] = [];

  // Check type references (e.g., User, Course, AuthnProvider)
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName;
    const symbol = typeChecker.getSymbolAtLocation(typeName);

    if (symbol) {
      // Check if this is an imported symbol (alias) - follow it to the original
      const symbolToCheck =
        symbol.flags & ts.SymbolFlags.Alias ? typeChecker.getAliasedSymbol(symbol) : symbol;

      const declarations = symbolToCheck.getDeclarations();
      if (declarations && declarations.length > 0) {
        for (const decl of declarations) {
          const sourceFile = decl.getSourceFile();
          if (sourceFile.fileName.endsWith('/db-types.ts')) {
            // Found a type from db-types.ts!
            violations.push(symbolToCheck.getName());
          } else {
            // If it's a type alias or interface defined locally, check its properties
            if (ts.isTypeAliasDeclaration(decl) && decl.type) {
              // Special case: Check if this is z.infer<typeof XxxSchema>
              const zodSchemaViolations = checkForZodInferPattern(decl.type, typeChecker);
              violations.push(...zodSchemaViolations);

              // Also check the type itself
              const nestedViolations = checkTypeNodeForDbTypes(decl.type, typeChecker, visited);
              violations.push(...nestedViolations);
            } else if (ts.isInterfaceDeclaration(decl)) {
              // Check interface members
              for (const member of decl.members) {
                if (ts.isPropertySignature(member) && member.type) {
                  const nestedViolations = checkTypeNodeForDbTypes(
                    member.type,
                    typeChecker,
                    visited,
                  );
                  violations.push(...nestedViolations);
                }
              }
            }
          }
        }
      }
    }

    // Check type arguments (e.g., Array<User>, Promise<Course>)
    if (typeNode.typeArguments) {
      for (const typeArg of typeNode.typeArguments) {
        const nestedViolations = checkTypeNodeForDbTypes(typeArg, typeChecker, visited);
        violations.push(...nestedViolations);
      }
    }
  }

  // Check array types (e.g., User[])
  if (ts.isArrayTypeNode(typeNode)) {
    const nestedViolations = checkTypeNodeForDbTypes(typeNode.elementType, typeChecker, visited);
    violations.push(...nestedViolations);
  }

  // Check union types (e.g., User | null)
  if (ts.isUnionTypeNode(typeNode)) {
    for (const type of typeNode.types) {
      const nestedViolations = checkTypeNodeForDbTypes(type, typeChecker, visited);
      violations.push(...nestedViolations);
    }
  }

  // Check intersection types (e.g., User & { extra: string })
  if (ts.isIntersectionTypeNode(typeNode)) {
    for (const type of typeNode.types) {
      const nestedViolations = checkTypeNodeForDbTypes(type, typeChecker, visited);
      violations.push(...nestedViolations);
    }
  }

  // Check object type literals and their properties
  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.type) {
        const nestedViolations = checkTypeNodeForDbTypes(member.type, typeChecker, visited);
        violations.push(...nestedViolations);
      }
    }
  }

  // Check indexed access types (e.g., User['name'])
  // These are safe! We're only extracting a specific property, not passing the whole object.
  // So we DON'T recurse into the object type for indexed access.
  if (ts.isIndexedAccessTypeNode(typeNode)) {
    // Do not check - indexed access is safe
  }

  return violations;
}

/**
 * Check if a type name is in the allowlist of safe types
 */
function isTypeInAllowlist(typeName: string, allowlist: (string | RegExp)[]): boolean {
  return allowlist.some((pattern) => {
    if (typeof pattern === 'string') {
      return typeName === pattern;
    }
    return pattern.test(typeName);
  });
}

/**
 * Check the props of a component for unsafe types from db-types.ts
 */
function checkComponentProps({
  context,
  typeChecker,
  componentSymbol,
  tsComponentNode,
  jsxElement,
  reportNode,
  allowlist,
}: {
  context: ReturnType<typeof ESLintUtils.RuleCreator.withoutDocs>['create'] extends (
    context: infer C,
  ) => any
    ? C
    : never;
  typeChecker: ts.TypeChecker;
  componentSymbol: ts.Symbol;
  tsComponentNode: ts.Node;
  jsxElement: TSESTree.JSXElement;
  reportNode: TSESTree.Node;
  allowlist: (string | RegExp)[];
}): void {
  const childOpeningElement = jsxElement.openingElement;

  // Get the component's type (function or class component)
  const componentType = typeChecker.getTypeOfSymbolAtLocation(componentSymbol, tsComponentNode);
  const signatures = componentType.getCallSignatures();

  if (signatures.length === 0) return;

  // Get the first parameter (props) of the component function
  const propsParam = signatures[0].getParameters()[0];
  if (!propsParam) return;

  const propsDeclaration = propsParam.valueDeclaration;

  if (!propsDeclaration || !ts.isParameter(propsDeclaration)) return;

  // Get the type annotation node from the props parameter
  const propsTypeNode = propsDeclaration.type;
  if (!propsTypeNode) return;

  // Check each property in the props type
  if (ts.isTypeLiteralNode(propsTypeNode)) {
    // Inline props object: { foo: string; bar: number }
    for (const member of propsTypeNode.members) {
      if (ts.isPropertySignature(member) && member.type && member.name) {
        if (!ts.isIdentifier(member.name)) continue;

        const propName = member.name.text;
        const violations = checkTypeNodeForDbTypes(member.type, typeChecker);

        if (violations.length > 0) {
          // Find the JSX attribute for this prop
          const attribute = childOpeningElement.attributes.find(
            (attr) =>
              attr.type === 'JSXAttribute' &&
              attr.name.type === 'JSXIdentifier' &&
              attr.name.name === propName,
          );

          for (const typeName of violations) {
            if (isTypeInAllowlist(typeName, allowlist)) continue;

            context.report({
              node: attribute || reportNode,
              messageId: 'unsafeTypes',
              data: { propName, typeName },
            });
          }
        }
      }
    }
  } else if (ts.isTypeReferenceNode(propsTypeNode)) {
    // Props is a type reference (e.g., interface or type alias)
    const symbol = typeChecker.getSymbolAtLocation(propsTypeNode.typeName);
    if (symbol) {
      const resolvedSymbol =
        symbol.flags & ts.SymbolFlags.Alias ? typeChecker.getAliasedSymbol(symbol) : symbol;
      const declarations = resolvedSymbol.getDeclarations();

      if (declarations && declarations.length > 0) {
        for (const decl of declarations) {
          if (ts.isInterfaceDeclaration(decl) || ts.isTypeLiteralNode(decl)) {
            const members = ts.isInterfaceDeclaration(decl) ? decl.members : decl.members;

            for (const member of members) {
              if (ts.isPropertySignature(member) && member.type && member.name) {
                if (!ts.isIdentifier(member.name)) continue;

                const propName = member.name.text;
                const violations = checkTypeNodeForDbTypes(member.type, typeChecker);

                if (violations.length > 0) {
                  // Find the JSX attribute for this prop
                  const attribute = childOpeningElement.attributes.find(
                    (attr) =>
                      attr.type === 'JSXAttribute' &&
                      attr.name.type === 'JSXIdentifier' &&
                      attr.name.name === propName,
                  );

                  for (const typeName of violations) {
                    if (isTypeInAllowlist(typeName, allowlist)) continue;

                    context.report({
                      node: attribute || reportNode,
                      messageId: 'unsafeTypes',
                      data: { propName, typeName },
                    });
                  }
                }
              }
            }
          } else if (ts.isTypeAliasDeclaration(decl) && decl.type) {
            // Type alias might be an inline object type
            if (ts.isTypeLiteralNode(decl.type)) {
              for (const member of decl.type.members) {
                if (ts.isPropertySignature(member) && member.type && member.name) {
                  if (!ts.isIdentifier(member.name)) continue;

                  const propName = member.name.text;
                  const violations = checkTypeNodeForDbTypes(member.type, typeChecker);

                  if (violations.length > 0) {
                    // Find the JSX attribute for this prop
                    const attribute = childOpeningElement.attributes.find(
                      (attr) =>
                        attr.type === 'JSXAttribute' &&
                        attr.name.type === 'JSXIdentifier' &&
                        attr.name.name === propName,
                    );

                    for (const typeName of violations) {
                      if (isTypeInAllowlist(typeName, allowlist)) continue;

                      context.report({
                        node: attribute || reportNode,
                        messageId: 'unsafeTypes',
                        data: { propName, typeName },
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Check for spread attributes
  const attributes = childOpeningElement.attributes;
  for (const attr of attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      context.report({
        node: reportNode,
        messageId: 'spreadAttributes',
      });
      continue;
    }
  }
}

export default ESLintUtils.RuleCreator.withoutDocs<
  [{ allowDbTypes?: (string | RegExp)[] }?],
  'spreadAttributes' | 'unsafeTypes'
>({
  meta: {
    type: 'problem',
    messages: {
      spreadAttributes: 'Spread attributes are not allowed in Hydrate children.',
      unsafeTypes:
        'Prop "{{propName}}" uses type "{{typeName}}" which is derived from db-types.ts. Use safe-db-types.ts instead.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowDbTypes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{}],
  create(context) {
    const options = context.options[0] || {};
    const allowlist = options.allowDbTypes || [];
    return {
      JSXElement(node) {
        const openingElementNameExpression = node.openingElement.name;
        if (openingElementNameExpression.type !== 'JSXIdentifier') return;

        const elementName = openingElementNameExpression.name;
        if (elementName !== HYDRATE_COMPONENT_NAME) return;

        const child = extractChild(node.children);
        if (!child) return;

        // Get the component being rendered
        const childOpeningElement = child.openingElement;
        const childElementName = childOpeningElement.name;

        if (childElementName.type !== 'JSXIdentifier') return;

        // Get the component's type to inspect its props
        const services = ESLintUtils.getParserServices(context);
        const typeChecker = services.program.getTypeChecker();
        const tsChildNode = services.esTreeNodeToTSNodeMap.get(childElementName);
        const componentSymbol = typeChecker.getSymbolAtLocation(tsChildNode);

        if (!componentSymbol) return;

        checkComponentProps({
          context,
          typeChecker,
          componentSymbol,
          tsComponentNode: tsChildNode,
          jsxElement: child,
          reportNode: child,
          allowlist,
        });
      },

      CallExpression(node) {
        // Check for hydrateHtml(<Component ... />, props?) calls
        if (node.callee.type !== 'Identifier' || node.callee.name !== HYDRATE_FUNCTION_NAME) return;

        // Should have at least one argument, the first is JSX element.
        if (node.arguments.length === 0) return;

        const arg = node.arguments[0];
        if (arg.type !== 'JSXElement') return;

        const jsxElement = arg;
        const openingElement = jsxElement.openingElement;
        const elementName = openingElement.name;

        if (elementName.type !== 'JSXIdentifier') return;

        // Get the component's type to inspect its props
        const services = ESLintUtils.getParserServices(context);
        const typeChecker = services.program.getTypeChecker();
        const tsElementNode = services.esTreeNodeToTSNodeMap.get(elementName);
        const componentSymbol = typeChecker.getSymbolAtLocation(tsElementNode);

        if (!componentSymbol) return;

        checkComponentProps({
          context,
          typeChecker,
          componentSymbol,
          tsComponentNode: tsElementNode,
          jsxElement,
          reportNode: node,
          allowlist,
        });
      },
    };
  },
});
