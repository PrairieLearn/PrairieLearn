import type {
  ConversionWarning,
  CourseExportInfo,
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

/** Response shape of the upload endpoint. */
export interface UploadResponse {
  results: SerializedConversionResult[];
  courseExportInfo?: CourseExportInfo;
  /** Directory names of questions that already exist in the course. */
  existingQuestionDirs: string[];
  /** Access rule properties that were stripped from the imported assessments. */
  strippedAccessRules: StrippedAccessRules;
  /** Video files that were excluded from the import. */
  skippedVideos: string[];
}
