import { Node } from '@tiptap/core';
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import clsx from 'clsx';
import { type ComponentType, useState } from 'preact/compat';
import { Card } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

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
  const [nodes, setNodes] = useState<string[] | null>(null);
  const textareaRows = Math.min(10, node.attrs.html.split('\n').length);
  return (
    <NodeViewWrapper className="p-0" contentEditable={false}>
      <Card className="border-warning">
        <Card.Header className="bg-warning-subtle d-flex align-items-center justify-content-between">
          <div className="d-flex gap-2">
            Raw HTML
            {nodes !== null && nodes.length !== 1 ? (
              <OverlayTrigger
                placement="right"
                tooltip={{
                  body: (
                    <>
                      You must have exactly one parent element, but you have {nodes.length} (
                      {nodes.join(', ')}). Either remove the extra elements, or combine them into a
                      single element by wrapping both of them in a single div.
                    </>
                  ),
                  props: { id: 'raw-html-warning-tooltip' },
                }}
              >
                <i
                  className="bi bi-exclamation-triangle text-danger"
                  aria-label="Raw HTML warning"
                  role="img"
                />
              </OverlayTrigger>
            ) : null}
          </div>
          <OverlayTrigger
            placement="left"
            tooltip={{
              body: (
                <>
                  This node type isn't supported by the rich text editor yet. You can edit the
                  underlying HTML here.
                </>
              ),
              props: { id: 'raw-html-help-tooltip' },
            }}
          >
            <i className="bi bi-question-circle" aria-label="Raw HTML help" role="img" />
          </OverlayTrigger>
        </Card.Header>
        <Card.Body>
          <textarea
            rows={textareaRows}
            value={node.attrs.html}
            className={clsx(
              'form-control',
              nodes !== null && nodes.length !== 1 && 'border-danger',
            )}
            onChange={(e) => {
              const newHtml = e.currentTarget.value;
              const template = document.createElement('template');
              template.innerHTML = newHtml;
              const nonWhitespaceNodes = Array.from(template.content.childNodes)
                .filter(
                  (node) => node.nodeName !== '#text' || (node.textContent?.trim().length ?? 0) > 0,
                )
                .map((node) => node.nodeName.toLowerCase());
              setNodes(nonWhitespaceNodes);

              // If the value is empty, delete the node.
              // TODO: Is this the cleanest way to do this?
              if (newHtml.length === 0) {
                const pos = props.getPos();
                if (pos != null) {
                  props.editor
                    .chain()
                    .focus()
                    .deleteRange({ from: pos, to: pos + props.node.nodeSize })
                    .run();
                }
              } else {
                updateAttributes({ html: newHtml });
              }
            }}
          />
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

  selectable: true,

  isolating: false,

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
