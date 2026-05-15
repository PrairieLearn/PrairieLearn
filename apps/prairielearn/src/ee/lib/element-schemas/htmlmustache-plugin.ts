import { validators as plMultipleChoiceValidators } from './pl-multiple-choice.validator.ts';
import {
  blockGroupValidators as plOrderBlocksBlockGroupValidators,
  validators as plOrderBlocksValidators,
} from './pl-order-blocks.validator.ts';

export { formats } from './htmlmustache-plugin-utils.ts';

export const validators = [
  ...plMultipleChoiceValidators,
  ...plOrderBlocksValidators,
  ...plOrderBlocksBlockGroupValidators,
];
