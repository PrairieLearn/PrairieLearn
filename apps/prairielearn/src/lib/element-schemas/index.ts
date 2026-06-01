import type { CustomTag } from '@prairielearn/tree-sitter-htmlmustache/linter';

import { elementModules } from './registry.generated.js';
import type { ElementSchemaModule } from './types.js';

function toCustomTag(module: ElementSchemaModule): CustomTag {
  const tag: CustomTag = { name: module.tag, schema: module.schema };
  if (module.children) {
    tag.children = Object.entries(module.children).map(([name, schema]) => ({ name, schema }));
  }
  return tag;
}

export const elementCustomTags: CustomTag[] = elementModules.map(toCustomTag);

export function serializeElementSchemas(): {
  schemas: Record<string, Record<string, unknown>>;
  childSchemas: Record<string, Record<string, Record<string, unknown>>>;
} {
  const schemas: Record<string, Record<string, unknown>> = {};
  const childSchemas: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const module of elementModules) {
    schemas[module.tag] = module.schema;
    if (module.children) {
      childSchemas[module.tag] = module.children;
    }
  }
  return { schemas, childSchemas };
}
