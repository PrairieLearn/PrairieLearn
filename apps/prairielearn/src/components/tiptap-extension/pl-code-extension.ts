import { mergeAttributes } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';

/*
<pl-code language="python">
def square(x):
    return x * x
</pl-code>
*/
export const PLCodeBlock = CodeBlock.extend({
  name: 'plCodeBlock',
  whitespace: 'pre',
  code: true,

  parseHTML() {
    return [
      {
        tag: 'pl-code',
        preserveWhitespace: 'full',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['pl-code', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});
