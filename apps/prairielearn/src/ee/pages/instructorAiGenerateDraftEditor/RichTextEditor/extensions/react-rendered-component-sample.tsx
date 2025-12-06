/**
 * This is a sample React-rendered component for the RichTextEditor.
 *
 * It should NOT be used yet.
 */
import { mergeAttributes } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react';

/*
<pl-code language="python">
def square(x):
    return x * x
</pl-code>
*/
const PLCodeBlockComponent = (props: ReactNodeViewProps<HTMLDivElement>) => {
  const updateAttributes = props.updateAttributes as (attrs: Partial<PlCodeAttrs>) => void;
  return (
    <NodeViewWrapper class="react-component">
      <button type="button" onClick={() => updateAttributes({ language: 'python' })}>
        Python
      </button>
      <div contenteditable="false">This is a code block</div>
      <NodeViewContent class="content" />
    </NodeViewWrapper>
  );
};

interface PlCodeAttrs {
  language: string;
  style: string;
  noHighlight: boolean;
  preventSelect: boolean;
  highlightLines: number[];
  highlightLinesColor: string;
  copyCodeButton: boolean;
  showLineNumbers: boolean;
  normalizeWhitespace: boolean;
}

// The UI needs to be aware of the defaults on these attributes so that it can
// render the correct UI.
const plCodeAttrs: Partial<PlCodeAttrs> = {
  style: 'friendly',
  noHighlight: false,
  preventSelect: false,
  copyCodeButton: false,
  showLineNumbers: false,
  normalizeWhitespace: false,
} as const;

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
  addNodeView() {
    return ReactNodeViewRenderer(PLCodeBlockComponent);
  },
  addAttributes() {
    return Object.fromEntries(
      Object.entries(plCodeAttrs).map(([key, value]) => [key, { default: value }]),
    );
  },
});
