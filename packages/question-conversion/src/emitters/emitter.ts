import type { IRItemContainer, IRSourceBankRef } from '../types/ir.js';
import type { PLAssessmentOutput, PLQuestionOutput } from '../types/pl-output.js';

/** A warning produced during conversion. */
export interface ConversionWarning {
  questionId: string;
  message: string;
  level?: 'warn' | 'info';
  /** When set, the warning is about an external question bank from another source course. */
  externalCourseId?: string;
}

/** Options for emitting PL output. */
export interface EmitOptions {
  topic?: string;
  tags?: string[];
  uuidNamespace?: string;
  /** Prefix for question IDs in the assessment (e.g. "imported/hw1"). */
  questionIdPrefix?: string;
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
  emit(itemContainer: IRItemContainer, options?: EmitOptions): ConversionResult;
}
