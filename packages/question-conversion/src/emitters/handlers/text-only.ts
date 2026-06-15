import type { BodyEmitHandler } from '../body-emit-handler.js';

export const textOnlyHandler: BodyEmitHandler = {
  bodyType: 'text-only',
  renderHtml() {
    return '';
  },
};
