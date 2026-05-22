import type {
  ConversionWarning,
  IRSourceBankRef,
  PLAssessmentInfoJson,
  PLQuestionInfoJson,
} from '@prairielearn/question-conversion';

/** Question output sent to the browser. Binary client file contents stay in an import draft. */
export interface SerializedQuestionOutput {
  draftId: string;
  originalDirectoryName: string;
  directoryName: string;
  sourceId: string;
  infoJson: PLQuestionInfoJson;
  questionHtml: string;
  serverPy?: string;
  clientFiles: Record<string, { size: number }>;
  /** Video files that were excluded from this question's assets. */
  skippedVideos: string[];
}

interface StoredSerializedQuestionOutput extends Omit<
  SerializedQuestionOutput,
  'draftId' | 'originalDirectoryName' | 'clientFiles'
> {
  clientFiles: Record<string, string>;
}

/** Conversion result stored server-side while the user reviews an import. */
export interface StoredSerializedConversionResult extends Omit<
  SerializedConversionResult,
  'draftId' | 'questions'
> {
  questions: StoredSerializedQuestionOutput[];
}

/** Conversion result sent to the browser for review. */
export interface SerializedConversionResult {
  draftId: string;
  sourceId: string;
  assessmentTitle: string;
  sourceType?: 'assessment' | 'question-bank';
  /** Question bank references that still need supplemental content before import. */
  unresolvedSourceBankRefs?: IRSourceBankRef[];
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

export type CollisionStrategy = 'overwrite' | 'rename';

export interface QuestionOverrides {
  title: string;
  topic: string;
  tags: string[];
  included: boolean;
  /** The original directoryName from the conversion output. */
  originalDirName: string;
  /** Whether this question collides with an existing question directory. */
  collides: boolean;
  /** How to handle the collision: overwrite existing or rename this question. */
  collisionStrategy: CollisionStrategy;
}

/** Generate a renamed directory by appending an incrementing suffix. */
export function resolveRenamedDir(originalDir: string, existingDirs: Set<string>): string {
  let candidate = `${originalDir}-2`;
  let n = 3;
  while (existingDirs.has(candidate)) {
    candidate = `${originalDir}-${n}`;
    n++;
  }
  return candidate;
}

export function hasCanvasUnresolvedSourceBankRefs(refs: IRSourceBankRef[]): boolean {
  return refs.some((ref) => ref.sourceBankExportId != null || ref.externalCourseId != null);
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
