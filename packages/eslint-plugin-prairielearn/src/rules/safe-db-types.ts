import { type TSESTree } from '@typescript-eslint/types';
import { ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

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
 * Returns all violations found.
 */
function checkTypeNodeForDbTypes(
  typeNode: ts.TypeNode,
  typeChecker: ts.TypeChecker,
  visited = new Set<ts.TypeNode>(),
): { typeName: string; propName?: string }[] {
  if (visited.has(typeNode)) return [];
  visited.add(typeNode);

  const violations: { typeName: string; propName?: string }[] = [];

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
            violations.push({ typeName: symbolToCheck.getName() });
          } else {
            // If it's a type alias or interface defined locally, check its properties
            if (ts.isTypeAliasDeclaration(decl) && decl.type) {
              const nestedViolations = checkTypeNodeForDbTypes(decl.type, typeChecker, visited);
              violations.push(...nestedViolations);
            } else if (ts.isInterfaceDeclaration(decl)) {
              // Check interface members
              for (const member of decl.members) {
                if (ts.isPropertySignature(member) && member.type) {
                  const propName =
                    member.name && ts.isIdentifier(member.name) ? member.name.text : 'unknown';
                  const nestedViolations = checkTypeNodeForDbTypes(
                    member.type,
                    typeChecker,
                    visited,
                  );
                  // Add property name context to nested violations
                  violations.push(...nestedViolations.map((v) => ({ ...v, propName })));
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
        const propName = member.name && ts.isIdentifier(member.name) ? member.name.text : 'unknown';
        const nestedViolations = checkTypeNodeForDbTypes(member.type, typeChecker, visited);
        // Add property name context to nested violations
        violations.push(...nestedViolations.map((v) => ({ ...v, propName })));
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

export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      spreadAttributes: 'Spread attributes are not allowed in Hydrate children.',
      unsafeTypes:
        'Prop "{{propName}}" has type "{{typeName}}" which is derived from db-types.ts. Use safe-db-types.ts instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      // TODO: handle `hydrateHtml(...)` calls as well?
      JSXElement(node) {
        const openingElementNameExpression = node.openingElement.name;

        // TODO: handle namespace and member expressions?
        if (openingElementNameExpression.type !== 'JSXIdentifier') return;

        const elementName = openingElementNameExpression.name;
        if (elementName !== 'Hydrate') return;

        // Check children, there should be exactly one.
        // TODO: should we have an error case here?
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

        // Get the component's type (function or class component)
        const componentType = typeChecker.getTypeOfSymbolAtLocation(componentSymbol, tsChildNode);
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

        // Check if any prop type references db-types.ts
        const results = checkTypeNodeForDbTypes(propsTypeNode, typeChecker);

        if (results.length > 0) {
          for (const result of results) {
            // Report on the child component element
            context.report({
              node: child,
              messageId: 'unsafeTypes',
              data: {
                propName: result.propName || 'unknown',
                typeName: result.typeName,
              },
            });
          }
        }

        const attributes = childOpeningElement.attributes;
        for (const attr of attributes) {
          if (attr.type === 'JSXSpreadAttribute') {
            context.report({
              node,
              messageId: 'spreadAttributes',
            });
            continue;
          }
        }
      },
    };
  },
});
