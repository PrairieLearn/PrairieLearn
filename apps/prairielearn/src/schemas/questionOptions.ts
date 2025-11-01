import { z } from 'zod';

import { QuestionOptionsCalculationJsonSchema } from './questionOptionsCalculation.js';
import { QuestionOptionsCheckboxJsonSchema } from './questionOptionsCheckbox.js';
import { QuestionOptionsFileJsonSchema } from './questionOptionsFile.js';
import { QuestionOptionsMultipleChoiceJsonSchema } from './questionOptionsMultipleChoice.js';
import { QuestionOptionsMultipleTrueFalseJsonSchema } from './questionOptionsMultipleTrueFalse.js';
import { QuestionOptionsv3JsonSchema } from './questionOptionsv3.js';

export const QuestionOptionsJsonSchema = z.union([
  QuestionOptionsCalculationJsonSchema,
  QuestionOptionsCheckboxJsonSchema,
  QuestionOptionsFileJsonSchema,
  QuestionOptionsMultipleChoiceJsonSchema,
  QuestionOptionsMultipleTrueFalseJsonSchema,
  QuestionOptionsv3JsonSchema,
]);

export type QuestionOptionsJson = z.infer<typeof QuestionOptionsJsonSchema>;
export type QuestionOptionsJsonInput = z.input<typeof QuestionOptionsJsonSchema>;
