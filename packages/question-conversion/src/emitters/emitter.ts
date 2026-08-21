import type { IRItemContainer, IRSourceBankRef } from '../types/ir.js';
import type { PLAssessmentOutput, PLQuestionOutput } from '../types/pl-output.js';

/** A warning produced during conversion. */
export interface ConversionWarning {
  questionId: string;
  message: string;
  level?: 'warn' | 'info';
  /** Machine-readable identifier for consumers that need to handle a warning specially. */
  code?: 'remote-image-copy-failed';
  /** When set, the warning is about an external question bank from another source course. */
  externalCourseId?: string;
}

/** Per-question outcome from copying remote image references into PrairieLearn client files. */
export interface RemoteImageCopyReport {
  type: 'remote-image-copy';
  questionId: string;
  /** Number of unique client files created, after content-based deduplication. */
  filesCreated: number;
}

/** Structured information produced during conversion. */
export type ConversionReport = RemoteImageCopyReport;

/** Options for emitting PL output. */
export interface EmitOptions {
  topic?: string;
  tags?: string[];
  uuidNamespace?: string;
  /** Prefix for question IDs in the assessment (e.g. "imported/hw1"). */
  questionIdPrefix?: string;
}

/** Processes a conversion in place before and/or after PrairieLearn output is emitted. */
export interface ConversionProcessor {
  beforeEmit?(itemContainer: IRItemContainer): void | Promise<void>;
  afterEmit?(result: ConversionResult, itemContainer: IRItemContainer): void | Promise<void>;
}

/** Options for processing and emitting PrairieLearn output. */
export interface EmitProcessedOptions extends EmitOptions {
  processors?: readonly ConversionProcessor[];
}

interface ConversionResultBase {
  sourceId: string;
  assessmentTitle: string;
  /**
   * PrairieLearn assessment-shaped output. For question-bank results, this is only used as a
   * question grouping wrapper and is not meant to be imported as an assessment.
   */
  assessment: PLAssessmentOutput;
  questions: PLQuestionOutput[];
  warnings: ConversionWarning[];
  reports: ConversionReport[];
}

interface AssessmentConversionResult extends ConversionResultBase {
  sourceType: 'assessment';
  /** Bank references that still need supplemental content to become importable questions. */
  unresolvedSourceBankRefs?: IRSourceBankRef[];
}

interface QuestionBankConversionResult extends ConversionResultBase {
  sourceType: 'question-bank';
}

/** Result of converting an item container. */
export type ConversionResult = AssessmentConversionResult | QuestionBankConversionResult;

/** Interface for format-specific output emitters. */
export interface OutputEmitter {
  /** Emits PrairieLearn output synchronously. */
  emit(itemContainer: IRItemContainer, options?: EmitOptions): ConversionResult;
  /** Runs processors around emission, awaiting each hook in order. */
  emitProcessed(
    itemContainer: IRItemContainer,
    options?: EmitProcessedOptions,
  ): Promise<ConversionResult>;
}
