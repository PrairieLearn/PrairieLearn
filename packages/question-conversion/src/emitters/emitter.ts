import type { IRItemContainer, IRSourceBankRef } from '../types/ir.js';
import type { PLAssessmentOutput, PLQuestionOutput } from '../types/pl-output.js';

/** A warning produced during conversion. */
export interface ConversionWarning {
  questionId: string;
  message: string;
  level?: 'warn' | 'info';
  /** When set, the warning is about an external question bank from another Canvas course. */
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

/** Result of converting an assessment. */
export interface ConversionResult {
  sourceId: string;
  assessmentTitle: string;
  sourceType?: 'assessment' | 'question-bank';
  /** Bank references that still need supplemental content to become importable questions. */
  unresolvedSourceBankRefs?: IRSourceBankRef[];
  assessment: PLAssessmentOutput;
  questions: PLQuestionOutput[];
  warnings: ConversionWarning[];
}

/** Interface for format-specific output emitters. */
export interface OutputEmitter {
  emit(assessment: IRItemContainer, options?: EmitOptions): ConversionResult;
}
