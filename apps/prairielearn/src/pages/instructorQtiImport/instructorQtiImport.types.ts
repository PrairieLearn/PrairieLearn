import type {
  ConversionWarning,
  PLAssessmentInfoJson,
  PLQuestionInfoJson,
} from '@prairielearn/question-conversion';

/** Serialized version of PLQuestionOutput with clientFiles as base64 strings. */
export interface SerializedQuestionOutput {
  directoryName: string;
  sourceId: string;
  infoJson: PLQuestionInfoJson;
  questionHtml: string;
  serverPy?: string;
  clientFiles: Record<string, string>;
  /** Video files that were excluded from this question's assets. */
  skippedVideos: string[];
}

/** Serialized version of ConversionResult. */
export interface SerializedConversionResult {
  assessmentTitle: string;
  assessment: {
    directoryName: string;
    infoJson: PLAssessmentInfoJson;
  };
  questions: SerializedQuestionOutput[];
  warnings: ConversionWarning[];
}

/** Access rule properties that were present but stripped during import. */
export interface StrippedAccessRules {
  hasTimeLimits: boolean;
  hasPasswords: boolean;
  hasDates: boolean;
}

/** A warning for a QTI entry that failed to parse. */
export interface ParseWarning {
  /** Identifier for the entry that failed (e.g. the QTI XML filename). */
  filename: string;
  /** The error message from the parser. */
  message: string;
}

/** Response shape of the upload endpoint. */
export interface UploadResponse {
  results: SerializedConversionResult[];
  /** QTI entries that failed to parse, surfaced as warnings. */
  parseWarnings: ParseWarning[];
  /** Directory names of questions that already exist in the course. */
  existingQuestionDirs: string[];
  /** Access rule properties that were stripped from the imported assessments. */
  strippedAccessRules: StrippedAccessRules;
  /** Assessment set names defined in the course's infoCourse.json. */
  assessmentSetNames: string[];
  /** Existing (set, number) pairs in this course instance, for deduplication. */
  existingAssessmentLabels: { set: string; number: string }[];
}
