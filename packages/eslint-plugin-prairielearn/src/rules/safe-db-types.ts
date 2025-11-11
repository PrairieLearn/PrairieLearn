import { ESLintUtils } from '@typescript-eslint/utils';
import { TSESTree } from '@typescript-eslint/types';
import type * as ts from 'typescript';

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
 * Check if a type (or any of its constituent types) is directly declared in db-types.ts
 * Returns the type name if it's from db-types.ts, null otherwise
 *
 * NOTE: This recursively checks properties of object types, but does not deeply
 * traverse nested object structures. For complex nested types, some db-types usage
 * may not be detected.
 */
function checkIfTypeFromDbTypes(
  type: ts.Type,
  typeChecker: ts.TypeChecker,
  visited = new Set<ts.Type>(),
): string | null {
  // Avoid infinite recursion on circular types
  if (visited.has(type)) return null;
  visited.add(type);

  console.log(`  Checking type: ${typeChecker.typeToString(type)}, flags: ${type.flags}`);

  // If it's a union type (e.g., User | null), check each constituent
  if (type.flags & 1048576) {
    // TypeFlags.Union
    console.log('    This is a union type');
    const unionTypes = (type as any).types;
    if (unionTypes) {
      for (const unionType of unionTypes) {
        const result = checkIfTypeFromDbTypes(unionType, typeChecker, visited);
        if (result) return result;
      }
    }
    return null;
  }

  // If it's an intersection type (e.g., branded types), check each constituent
  if (type.flags & 2097152) {
    // TypeFlags.Intersection
    console.log('    This is an intersection type');
    const intersectionTypes = (type as any).types;
    if (intersectionTypes) {
      for (const intersectionType of intersectionTypes) {
        const result = checkIfTypeFromDbTypes(intersectionType, typeChecker, visited);
        if (result) return result;
      }
    }
    return null;
  }

  // Check if this type is directly declared in db-types.ts
  const symbol = type.getSymbol() || (type as any).aliasSymbol;
  if (symbol) {
    console.log(`    Symbol: ${symbol.getName()}`);
    const declarations = symbol.getDeclarations();
    if (declarations && declarations.length > 0) {
      for (const decl of declarations) {
        const sourceFile = (decl as any).getSourceFile();
        if (sourceFile) {
          console.log(`      Declared in: ${sourceFile.fileName}`);
          if (sourceFile.fileName.endsWith('/db-types.ts')) {
            // Return the symbol name (e.g., "User", "Course")
            return symbol.getName();
          }
        }
      }
    }
  }

  // Also check aliasSymbol separately (for type aliases)
  const aliasSymbol = (type as any).aliasSymbol;
  if (aliasSymbol && aliasSymbol !== symbol) {
    console.log(`    Alias symbol: ${aliasSymbol.getName()}`);
    const declarations = aliasSymbol.getDeclarations();
    if (declarations && declarations.length > 0) {
      for (const decl of declarations) {
        const sourceFile = (decl as any).getSourceFile();
        if (sourceFile) {
          console.log(`      Alias declared in: ${sourceFile.fileName}`);
          if (sourceFile.fileName.endsWith('/db-types.ts')) {
            return aliasSymbol.getName();
          }
        }
      }
    }
  }

  // For object types, check properties recursively
  if (type.flags & 524288) {
    // TypeFlags.Object
    console.log('    This is an object type');

    // Check array element types FIRST (before checking properties)
    // This is important because Array has many built-in properties
    if ((type as any).typeArguments) {
      const typeArgs = (type as any).typeArguments as ts.Type[];
      console.log(`      Has ${typeArgs.length} type arguments (array/generic)`);
      for (const typeArg of typeArgs) {
        const result = checkIfTypeFromDbTypes(typeArg, typeChecker, visited);
        if (result) return result;
      }
    }

    const properties = typeChecker.getPropertiesOfType(type);
    console.log(`      Has ${properties.length} properties`);
    for (const prop of properties) {
      // Skip the BRAND property from branded types
      if (prop.getName().startsWith('__@BRAND@')) continue;

      const propType = typeChecker.getTypeOfSymbol(prop);
      const result = checkIfTypeFromDbTypes(propType, typeChecker, visited);
      if (result) return result;
    }
  }

  return null;
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

        const attributes = child.openingElement.attributes;
        for (const attr of attributes) {
          if (attr.type === 'JSXSpreadAttribute') {
            // TODO: better handling of this?
            context.report({
              node,
              messageId: 'spreadAttributes',
            });
            continue;
          }

          if (attr.name.type !== 'JSXIdentifier') continue;

          if (attr.value?.type !== 'JSXExpressionContainer') continue;
          const expression = attr.value.expression;

          const services = ESLintUtils.getParserServices(context);
          const tsNode = services.esTreeNodeToTSNodeMap.get(expression);
          const typeChecker = services.program.getTypeChecker();

          // Try to get the contextual type (expected type from the component prop definition)
          const contextualType = typeChecker.getContextualType(tsNode as any);

          // Also get the actual type of the expression being passed
          const expressionType = typeChecker.getTypeAtLocation(tsNode);

          console.log(`Checking prop "${attr.name.name}"`);
          console.log(
            `  Contextual type: ${contextualType ? typeChecker.typeToString(contextualType) : 'none'}`,
          );
          console.log(`  Expression type: ${typeChecker.typeToString(expressionType)}`);

          if (contextualType) {
            const typeName = checkIfTypeFromDbTypes(contextualType, typeChecker);

            if (typeName) {
              console.log(`Found unsafe type: ${typeName}`);
              context.report({
                node: attr.value,
                messageId: 'unsafeTypes',
                data: {
                  propName: attr.name.name,
                  typeName: typeName,
                },
              });
            }
          }
        }
      },
    };
  },
});
