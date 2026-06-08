import type { CustomTag } from '@prairielearn/tree-sitter-htmlmustache/linter';

import { elementModules } from './registry.generated.js';
import type { ElementSchemaChild, ElementSchemaModule } from './types.js';

function childToCustomTag(name: string, child: ElementSchemaChild): CustomTag {
  const tag: CustomTag = { name, schema: child.schema };
  if (child.children) {
    tag.children = Object.entries(child.children).map(([childName, grandchild]) =>
      childToCustomTag(childName, grandchild),
    );
  }
  return tag;
}

function toCustomTag(module: ElementSchemaModule): CustomTag {
  const tag: CustomTag = { name: module.tag, schema: module.schema };
  if (module.children) {
    tag.children = Object.entries(module.children).map(([name, child]) =>
      childToCustomTag(name, child),
    );
  }
  return tag;
}

export const elementCustomTags: CustomTag[] = elementModules.map(toCustomTag);
