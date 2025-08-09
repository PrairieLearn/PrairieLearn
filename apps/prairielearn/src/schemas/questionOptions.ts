import { z } from 'zod/v4';

import { QuestionCalculationOptionsJsonSchema } from './questionOptionsCalculation.js';
import { QuestionCheckboxOptionsJsonSchema } from './questionOptionsCheckbox.js';
import { QuestionFileOptionsJsonSchema } from './questionOptionsFile.js';
import { QuestionMultipleChoiceOptionsJsonSchema } from './questionOptionsMultipleChoice.js';
import { QuestionMultipleTrueFalseOptionsJsonSchema } from './questionOptionsMultipleTrueFalse.js';
import { QuestionOptionsv3JsonSchema } from './questionOptionsv3.js';

export const QuestionOptionsJsonSchema = z.union([
  QuestionCalculationOptionsJsonSchema,
  QuestionCheckboxOptionsJsonSchema,
  QuestionFileOptionsJsonSchema,
  QuestionMultipleChoiceOptionsJsonSchema,
  QuestionMultipleTrueFalseOptionsJsonSchema,
  QuestionOptionsv3JsonSchema,
]);

export type QuestionOptionsJson = z.infer<typeof QuestionOptionsJsonSchema>;
export type QuestionOptionsJsonInput = z.input<typeof QuestionOptionsJsonSchema>;
