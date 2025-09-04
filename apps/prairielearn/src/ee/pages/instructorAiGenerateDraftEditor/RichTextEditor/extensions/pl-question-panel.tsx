/* eslint-disable no-console */
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
export const PlQuestionPanel = Node.create({
  name: 'plQuestionPanel',
  group: 'block',
  content: 'paragraph block+',

  parseHTML() {
    return [
      {
        tag: 'pl-question-panel',
      },
    ];
  },

  renderHTML() {
    return ['pl-question-panel', 0];
  },

  addCommands() {
    return {
      toggleQuestionPanel:
        () =>
        ({ commands, state }) => {
          const type = getNodeType('plQuestionPanel', state.schema);
          const isActive = isNodeActive(state, type, {});
          console.log('isActive', isActive);
          if (isActive) {
            const result = commands.lift(type);
            console.log('result', result);
            return result;
          }

          const result = commands.wrapIn(type, {});
          console.log('result', result);
          return result;
        },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggleQuestionPanel: {
      /**
       * Toggle wrapping content in a pl-question-panel element.
       * If the content is already wrapped in a pl-question-panel, it will be unwrapped.
       * If not wrapped, it will be wrapped in a pl-question-panel.
       * @example editor.commands.toggleQuestionPanel()
       */
      toggleQuestionPanel: () => ReturnType;
    };
  }
}
