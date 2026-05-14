import { ESLintUtils } from '@typescript-eslint/utils';

interface AttributeValueNode {
  type: 'AttributeValue';
  value: string;
  parts?: { type: string }[];
}

interface AttributeKeyNode {
  type: 'AttributeKey';
  value: string;
}

interface AttributeNode {
  type: 'Attribute';
  key: AttributeKeyNode;
  value?: AttributeValueNode;
}

interface TagNode {
  type: 'Tag';
  name: string;
  attributes: AttributeNode[];
}

function findIdAttr(node: TagNode): AttributeNode | undefined {
  return node.attributes.find((attr) => attr.key && attr.key.value.toLowerCase() === 'id');
}

function hasTemplatePart(node: AttributeValueNode): boolean {
  return node.parts?.some((part) => part.type === 'Template') ?? false;
}

/**
 * Variant of `@html-eslint/no-duplicate-id` that ignores tags whose names start
 * with `pl-`. The `id` attribute on PrairieLearn elements (e.g. `pl-sketch-tool
 * id="fd"`) is not a DOM id, it's an element-specific identifier consumed by
 * the parent element, so duplicates across separate parents are legal.
 */
export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      duplicateId: "The id '{{id}}' is duplicated.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const idAttrs = new Map<string, AttributeValueNode[]>();

    return {
      Tag(node: TagNode) {
        if (node.name.toLowerCase().startsWith('pl-')) return;
        const idAttr = findIdAttr(node);
        if (!idAttr?.value) return;
        if (hasTemplatePart(idAttr.value)) return;
        const list = idAttrs.get(idAttr.value.value) ?? [];
        list.push(idAttr.value);
        idAttrs.set(idAttr.value.value, list);
      },
      'Document:exit'() {
        for (const attrs of idAttrs.values()) {
          if (attrs.length <= 1) continue;
          for (const attr of attrs) {
            context.report({
              node: attr as never,
              data: { id: attr.value },
              messageId: 'duplicateId',
            });
          }
        }
      },
    };
  },
});
