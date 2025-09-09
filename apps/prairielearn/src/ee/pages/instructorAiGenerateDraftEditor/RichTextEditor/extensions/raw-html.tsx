import { Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { type ComponentType } from 'preact/compat';
import { Card, Form } from 'react-bootstrap';

interface RawHtmlAttrs {
  html: string;
  tag: string;
}

const RawHtmlComponent = (
  props: ReactNodeViewProps<HTMLDivElement> & {
    updateAttributes: (attrs: Partial<RawHtmlAttrs>) => void;
    node: ReactNodeViewProps<HTMLDivElement>['node'] & {
      attrs: RawHtmlAttrs;
    };
  },
) => {
  const { node, updateAttributes } = props;
  return (
    <NodeViewWrapper class="p-0" contentEditable={false}>
      <Card class="border-warning">
        <Card.Header class="bg-warning-subtle">Raw HTML</Card.Header>
        <Card.Body>
          <Form>
            <Form.Group controlId="rawHtmlEditor">
              <Form.Control
                as="textarea"
                rows={10}
                value={node.attrs.html}
                onFocus={() => {
                  const pos = props.getPos?.();
                  if (typeof pos === 'number') {
                    const { state, view } = props.editor;
                    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
                  }
                }}
                onChange={(e) => updateAttributes({ html: e.currentTarget.value })}
              />
            </Form.Group>
          </Form>
        </Card.Body>
      </Card>
    </NodeViewWrapper>
  );
};

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
  priority: -1000,

  addAttributes() {
    return {
      html: {
        parseHTML: (element) => element.outerHTML,
        rendered: false,
      },
      tag: {
        parseHTML: (element) => element.tagName.toLowerCase(),
        rendered: false,
      },
    };
  },

  parseHTML() {
    // For this to work, we need all the nodes to be matched correctly by the other extensions.
    return [
      {
        tag: '*',
      },
    ];
  },

  /**
   * This node view should render the HTML as a Block that says "Raw HTML" with a border.
   * On click, it should show the HTML in a modal for editing.
   */
  addNodeView() {
    return ReactNodeViewRenderer(
      RawHtmlComponent as ComponentType<ReactNodeViewProps<HTMLDivElement>>,
    );
  },

  renderHTML({ node }) {
    const template = document.createElement('template');
    template.innerHTML = node.attrs.html;
    return template.content.firstChild!;
  },
});
