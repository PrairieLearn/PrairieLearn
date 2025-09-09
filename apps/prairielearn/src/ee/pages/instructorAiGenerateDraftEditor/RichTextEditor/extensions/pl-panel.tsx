/* */
/**
 * This is a Tiptap extension for the pl-question-panel element.
 * It allows toggling whether the content is wrapped in a pl-question-panel element.
 * TODO: Get this working.
 *
 */
import { Node, getNodeType, isNodeActive } from '@tiptap/core';

// https://github.com/ueberdosis/tiptap/blob/develop/packages/core/src/commands/toggleNode.ts
// https://github.com/ueberdosis/tiptap/discussions/2272
// https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node
export const PlPanel = Node.create({
  name: 'plPanel',
  group: 'block',
  content: '(paragraph | block)+',

  parseHTML() {
    return [
      {
        tag: 'pl-question-panel',
      },
      {
        tag: 'pl-submission-panel',
      },
      {
        tag: 'pl-answer-panel',
      },
    ];
  },

  addAttributes() {
    return {
      tag: {
        parseHTML: (element) => element.tagName.toLowerCase(),
        rendered: false,
      },
    };
  },

  renderHTML({ node }) {
    return [node.attrs.tag, 0];
  },

  addCommands() {
    return {
      togglePanelVisibility:
        (panelType: 'question' | 'submission' | 'answer' | 'always') =>
        ({ commands, state }) => {
          const type = getNodeType('plPanel', state.schema);
          const isActive = isNodeActive(state, type, {});
          const tagMap = {
            question: 'pl-question-panel',
            submission: 'pl-submission-panel',
            answer: 'pl-answer-panel',
          } as const;

          if (panelType === 'always') {
            // Remove the panel wrapper if present
            if (isActive) {
              return commands.lift(type);
            }
            return true;
          }

          // question/submission/answer
          if (isActive) {
            return commands.updateAttributes('plPanel', { tag: tagMap[panelType] });
          }
          return commands.wrapIn(type, { tag: tagMap[panelType] });
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
      togglePanelVisibility: (
        panelType: 'question' | 'submission' | 'answer' | 'always',
      ) => ReturnType;
    };
  }
}
