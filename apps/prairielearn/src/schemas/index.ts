/**
 * There are 4 object kinds that are defined in this directory:
 * - JSON (ajv) schemas (info... e.g. infoCourse)
 * - Zod schemas (...JsonSchema)
 * - Input types (...JsonInput)
 * - Output types (...Json)
 *
 * If you have already parsed the object, you should use the output types.
 * If you have an unparsed object, you should use the input types.
 */

export * from './infoAssessment.js';
export * from './infoCourse.js';
export * from './infoCourseInstance.js';
export * from './infoElementCore.js';
export * from './infoElementCourse.js';
export * from './infoElementExtension.js';
export * from './infoQuestion.js';
export * from './questionOptionsCalculation.js';
export * from './questionOptionsCheckbox.js';
export * from './questionOptionsFile.js';
export * from './questionOptionsMultipleChoice.js';
export * from './questionOptionsMultipleTrueFalse.js';
export * from './questionOptionsv3.js';
export * from './comment.js';

// Defines the JSON schemas for the Zod schemas, used by ajv-based validation
export * from './jsonSchemas.js';
