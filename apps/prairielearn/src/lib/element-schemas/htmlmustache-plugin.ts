import { elementModules } from './registry.generated.ts';

export { formats } from './htmlmustache-plugin-utils.ts';

export const validators = elementModules.flatMap((module) => module.validators ?? []);
