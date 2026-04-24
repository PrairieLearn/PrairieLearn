import type { QTI12ParsedItem } from '../../types/qti12.js';
import { TransformRegistry } from '../transform-registry.js';

import { calculatedHandler } from './calculated.js';
import { essayHandler } from './essay.js';
import { fileUploadHandler } from './file-upload.js';
import { fillInBlanksHandler } from './fill-in-blanks.js';
import { matchingHandler } from './matching.js';
import { multipleAnswersHandler } from './multiple-answers.js';
import { multipleChoiceHandler } from './multiple-choice.js';
import { multipleDropdownsHandler } from './multiple-dropdowns.js';
import { numericalHandler } from './numerical.js';
import { shortAnswerHandler } from './short-answer.js';
import { textOnlyHandler } from './text-only.js';
import { trueFalseHandler } from './true-false.js';

/** Create a TransformRegistry pre-populated with all QTI 1.2 handlers. */
export function createQTI12Registry(): TransformRegistry<QTI12ParsedItem> {
  const registry = new TransformRegistry<QTI12ParsedItem>();
  registry.register(multipleChoiceHandler);
  registry.register(trueFalseHandler);
  registry.register(multipleAnswersHandler);
  registry.register(matchingHandler);
  registry.register(fillInBlanksHandler);
  registry.register(multipleDropdownsHandler);
  registry.register(textOnlyHandler);
  registry.register(essayHandler);
  registry.register(shortAnswerHandler);
  registry.register(numericalHandler);
  registry.register(calculatedHandler);
  registry.register(fileUploadHandler);
  return registry;
}
