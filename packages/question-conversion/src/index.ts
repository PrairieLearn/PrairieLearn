// Public API
export { convert, convertWith } from './pipeline.js';
export type { ConvertOptions } from './pipeline.js';

// Parsers
export { QTI12AssessmentParser } from './parsers/qti12/index.js';
export type { InputParser, ParseOptions } from './parsers/parser.js';

// Emitters
export { PLEmitter } from './emitters/pl-emitter.js';
export type {
  OutputEmitter,
  ConversionResult,
  ConversionWarning,
  EmitOptions,
} from './emitters/emitter.js';

// Transform registry (for extensibility)
export { TransformRegistry } from './transforms/transform-registry.js';
export type { TransformHandler, TransformResult } from './transforms/transform-registry.js';
export { createQTI12Registry } from './transforms/qti12/index.js';

// Types
export type {
  IRAssessment,
  IRQuestion,
  IRQuestionBody,
  IRChoice,
  IRMatchPair,
  IRMatchDistractor,
  IRBlank,
  IRNumericAnswer,
  IROrderItem,
  IRFeedback,
  AssetReference,
} from './types/ir.js';
export type {
  PLQuestionInfoJson,
  PLQuestionOutput,
  PLAssessmentInfoJson,
  PLAllowAccessRule,
  PLAssessmentZone,
  PLAssessmentQuestion,
  PLAssessmentOutput,
} from './types/pl-output.js';

// Course export utilities
export { detectCourseExport, findQtiFilesFromManifest } from './utils/course-export.js';
export type { CourseExportInfo, QtiFileEntry } from './utils/course-export.js';
export { slugify } from './utils/slugify.js';
