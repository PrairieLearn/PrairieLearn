import { elementModules } from './registry.generated.js';

export { formats } from './htmlmustache-plugin-utils.ts';

export const validators = elementModules.flatMap((module) => module.validators ?? []);
