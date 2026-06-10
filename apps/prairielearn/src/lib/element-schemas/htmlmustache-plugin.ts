// This module is the `pluginModule` entry point in `.htmlmustache.jsonc`: the
// htmlmustache CLI imports it (and everything it transitively value-imports —
// the registry, the element modules, validators, and helpers) directly as
// TypeScript via Node's native type stripping. Relative value imports anywhere
// in that graph must use real `.ts` extensions; a `.js` specifier would point
// at a file that doesn't exist and break `make lint-mustache`.
import { elementModules } from './registry.generated.ts';

export { formats } from './htmlmustache-plugin-utils.ts';

export const validators = elementModules.flatMap((module) => module.validators ?? []);
