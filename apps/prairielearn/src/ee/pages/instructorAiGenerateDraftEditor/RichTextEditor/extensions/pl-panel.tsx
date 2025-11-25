/**
 * This is a Tiptap extension for the pl-question-panel, pl-answer-panel, and pl-submission-panel elements.
 */
import { Node, getNodeType, isNodeActive } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import { type ComponentType } from 'preact/compat';

import { OverlayTrigger } from '@prairielearn/ui';

export const panelMeta = {
  'pl-question-panel': {
    color: 'primary',
    icon: 'bi-question-circle',
    label: 'Question Panel',
    name: 'question',
  },
  'pl-answer-panel': {
    color: 'success',
    icon: 'bi-check-circle',
    label: 'Answer Panel',
    name: 'answer',
  },
  'pl-submission-panel': {
    color: 'warning',
    icon: 'bi-arrow-repeat',
    label: 'Submission Panel',
    name: 'submission',
  },
} as const;

// https://github.com/ueberdosis/tiptap/blob/develop/packages/core/src/commands/toggleNode.ts
// https://github.com/ueberdosis/tiptap/discussions/2272
// https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node
export const PlPanel = Node.create({
  name: 'plPanel',
  group: 'block',
  content: '(paragraph | block)+',

  parseHTML() {
    return Object.keys(panelMeta).map((tag) => ({ tag }));
  },

  addAttributes() {
    return {
      tag: {
        parseHTML: (element) => element.tagName.toLowerCase(),
        rendered: false,
      },
    };
  },

  addNodeView() {
    const PlPanelComponent = (
      props: ReactNodeViewProps<HTMLDivElement> & {
        node: ReactNodeViewProps<HTMLDivElement>['node'] & {
          attrs: { tag: keyof typeof panelMeta };
        };
      },
    ) => {
      const tag = props.node.attrs.tag;
      const style = panelMeta[tag];

      return (
        <NodeViewWrapper class="my-2">
          <div class={`d-flex border-start border-4 border-${style.color} rounded-1`}>
            <div class="d-flex align-items-center justify-content-center" style={{ width: '2em' }}>
              <OverlayTrigger
                placement="top"
                tooltip={{ body: style.label, props: { id: `pl-panel-${tag}-tooltip` } }}
              >
                <i
                  class={`bi ${style.icon} text-${style.color}`}
                  aria-label={style.label}
                  role="img"
                />
              </OverlayTrigger>
            </div>
            <div class="flex-grow-1 ps-2 pe-2 py-2">
              <NodeViewContent />
            </div>
          </div>
        </NodeViewWrapper>
      );
    };

    return ReactNodeViewRenderer(
      PlPanelComponent as ComponentType<ReactNodeViewProps<HTMLDivElement>>,
    );
  },

  renderHTML({ node }) {
    return [node.attrs.tag, 0];
  },

  addCommands() {
    return {
      togglePanelVisibility:
        (panelType: keyof typeof panelMeta | 'always') =>
        ({ commands, state }) => {
          const type = getNodeType('plPanel', state.schema);
          const isActive = isNodeActive(state, type, {});
          if (panelType === 'always') {
            // Nothing to do
            if (!isActive) {
              return true;
            }

            return commands.lift('plPanel');
          }

          // question/submission/answer
          if (isActive) {
            return commands.updateAttributes('plPanel', { tag: panelType });
          }
          return commands.wrapIn(type, { tag: panelType });
        },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    togglePanelVisibility: {
      /**
       * Set panel visibility to one of the panel types or always (no panel wrapper)
       */
      togglePanelVisibility: (panelType: keyof typeof panelMeta | 'always') => ReturnType;
    };
  }
}
