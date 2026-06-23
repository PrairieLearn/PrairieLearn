import type { CustomTag } from '@prairielearn/tree-sitter-htmlmustache/linter';

import { elementModules } from './registry.generated.ts';
import type { ElementChildSchema, ElementSchemaModule } from './types.ts';

type ChildTag = NonNullable<CustomTag['children']>[number];

function toChildTags(children: Record<string, ElementChildSchema>): ChildTag[] {
  return Object.entries(children).map(([name, child]) => {
    const tag: ChildTag = { name };
    if (child.schema) tag.schema = child.schema;
    if (child.children) tag.children = toChildTags(child.children);
    if (child.allowAdditionalChildren) tag.allowAdditionalChildren = true;
    return tag;
  });
}

function toCustomTag(module: ElementSchemaModule): CustomTag {
  const tag: CustomTag = { name: module.tag, schema: module.schema };
  if (module.children) {
    tag.children = toChildTags(module.children);
  }
  return tag;
}

export const elementCustomTags: CustomTag[] = elementModules.map(toCustomTag);
