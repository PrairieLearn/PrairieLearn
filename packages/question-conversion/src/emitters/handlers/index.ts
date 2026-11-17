import { BodyEmitRegistry } from '../body-emit-handler.js';

import { calculatedHandler } from './calculated.js';
import { checkboxHandler } from './checkbox.js';
import { fileUploadHandler } from './file-upload.js';
import { fillInBlanksHandler } from './fill-in-blanks.js';
import { integerHandler } from './integer.js';
import { matchingHandler } from './matching.js';
import { multipleChoiceHandler } from './multiple-choice.js';
import { multipleDropdownsHandler } from './multiple-dropdowns.js';
import { numericHandler } from './numeric.js';
import { orderingHandler } from './ordering.js';
import { richTextHandler } from './rich-text.js';
import { stringInputHandler } from './string-input.js';
import { textOnlyHandler } from './text-only.js';

export function createPLBodyRegistry(): BodyEmitRegistry {
  const registry = new BodyEmitRegistry();
  registry.register(multipleChoiceHandler);
  registry.register(checkboxHandler);
  registry.register(matchingHandler);
  registry.register(fillInBlanksHandler);
  registry.register(multipleDropdownsHandler);
  registry.register(numericHandler);
  registry.register(integerHandler);
  registry.register(stringInputHandler);
  registry.register(orderingHandler);
  registry.register(richTextHandler);
  registry.register(textOnlyHandler);
  registry.register(fileUploadHandler);
  registry.register(calculatedHandler);
  return registry;
}
