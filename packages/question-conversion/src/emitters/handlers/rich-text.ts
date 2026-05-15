import type { BodyEmitHandler } from '../body-emit-handler.js';

export const richTextHandler: BodyEmitHandler = {
  bodyType: 'rich-text',
  renderHtml() {
    return '<pl-rich-text-editor file-name="answer.html"></pl-rich-text-editor>';
  },
};
