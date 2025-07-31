import { Node } from '@tiptap/core';

// https://github.com/ueberdosis/tiptap/discussions/2272
// https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node
export const RawHtml = Node.create({
  name: 'rawHtml',

  // When not given, the node does not allow any content.
  // content: 'text*',

  // When not given, nodes with inline content default to allowing all marks, other nodes default to not allowing marks.
  // marks: '',

  group: 'block',

  // https://prosemirror.net/docs/ref/#model.NodeSpec.definingAsContext
  // Determines whether this node is considered an important parent node during replace operations (such as paste).
  // https://prosemirror.net/docs/ref/#model.NodeSpec.definingForContent
  // In inserted content the defining parents of the content are preserved when possible.
  defining: false,

  // Whitespace *may* be important, preserve it.
  whitespace: 'pre',

  // Though this isn't a leaf node, it doesn't have directly editable content and should be treated as a single unit in the view.
  atom: true,

  // Match last.

  addAttributes() {
    return {
      html: {
        parseHTML: (element) => {
          const html = element.innerHTML;
          return html;
        },
        rendered: false,
      },
      tag: {
        parseHTML: (element) => {
          const tag = element.tagName.toLowerCase();
          console.log('tag', tag);
          return tag;
        },
        rendered: false,
      },
      attrs: {
        parseHTML: (element) => {
          const attrs = element.attributes;
          return attrs;
        },
        rendered: false,
      },
    };
  },

  parseHTML() {
    // https://github.com/ueberdosis/tiptap/blob/e0567acfcad097f65dd76e87804eff1c9d805320/packages/extension-list/src/task-item/task-item.ts
    console.log('parseHTML', this.options);
    // Match on all tags.
    // For this to work, we need all the nodes to be matched correctly by the other extensions.
    return [
      {
        tag: '*',
        // priority: 1,
      },
      // {
      //   tag: 'my-invalid-node-children',
      // },
    ];
  },

  renderHTML({ node }) {
    const div = document.createElement(node.attrs.tag);
    for (const attr of node.attrs.attrs) {
      div.setAttribute(attr.name, attr.value);
    }
    div.innerHTML = node.attrs.html;
    div.dataset.type = 'raw';
    return div;
  },
});
