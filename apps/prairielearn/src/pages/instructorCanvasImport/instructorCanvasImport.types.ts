import type {
  ConversionWarning,
  CourseExportInfo,
  PLAssessmentInfoJson,
  PLQuestionInfoJson,
  PLRubricJson,
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
    rubricJson?: PLRubricJson;
  };
  questions: SerializedQuestionOutput[];
  warnings: ConversionWarning[];
}

/** Response shape of the upload endpoint. */
export interface UploadResponse {
  results: SerializedConversionResult[];
  courseExportInfo?: CourseExportInfo;
}

/** Row returned by the imported assessments query. */
export interface ImportedAssessmentRow {
  id: string;
  tid: string;
  title: string;
  type: string;
  question_count: number;
}
