import type {
  ConversionWarning,
  IRSourceBankRef,
  PLAssessmentInfoJson,
  PLAssessmentZone,
  PLQuestionInfoJson,
} from '@prairielearn/question-conversion';

export const QTI_IMPORT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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

interface SerializedConversionResultCommon {
  draftId: string;
  sourceId: string;
  /** Display title of the source item container (assessment or question bank). */
  title: string;
  questions: SerializedQuestionOutput[];
  warnings: ConversionWarning[];
}

interface SerializedAssessmentConversionResult extends SerializedConversionResultCommon {
  sourceType: 'assessment';
  /** PrairieLearn assessment to create on import. */
  assessment: {
    directoryName: string;
    infoJson: PLAssessmentInfoJson;
  };
  /** Question bank references that still need supplemental content before import. */
  unresolvedSourceBankRefs?: IRSourceBankRef[];
}

interface SerializedQuestionBankConversionResult extends SerializedConversionResultCommon {
  sourceType: 'question-bank';
  /** Directory name for organizing questions in this bank. */
  directoryName: string;
}

/** Conversion result sent to the browser for review. */
export type SerializedConversionResult =
  SerializedAssessmentConversionResult | SerializedQuestionBankConversionResult;

type StoredSerializedConversionResultCommon = Omit<
  SerializedConversionResultCommon,
  'draftId' | 'questions'
> & {
  questions: StoredSerializedQuestionOutput[];
};

/** Conversion result stored server-side while the user reviews an import. */
export type StoredSerializedConversionResult =
  | (StoredSerializedConversionResultCommon & {
      sourceType: 'assessment';
      assessment: {
        directoryName: string;
        infoJson: PLAssessmentInfoJson;
      };
      unresolvedSourceBankRefs?: IRSourceBankRef[];
    })
  | (StoredSerializedConversionResultCommon & {
      sourceType: 'question-bank';
      directoryName: string;
    });

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

export const DUPLICATE_ASSESSMENT_QUESTION_WARNING =
  'This question appears multiple times on the assessment. Only the first occurrence of the question will be imported.';

/**
 * Remove repeated references to the same question within an assessment's
 * zones, keeping only the first occurrence. PrairieLearn does not allow a
 * question to appear more than once on an assessment, so duplicates (e.g. a
 * question placed directly on a Canvas quiz that also appears in a question
 * group pulling from a bank) would otherwise fail to sync.
 */
export function deduplicateAssessmentZoneQuestions(zones: PLAssessmentZone[]): {
  zones: PLAssessmentZone[];
  warnings: ConversionWarning[];
} {
  const seenQuestionIds = new Set<string>();
  const duplicateQuestionIds = new Set<string>();

  const dedupedZones: PLAssessmentZone[] = [];
  for (const zone of zones) {
    const questions = zone.questions.filter((question) => {
      if (seenQuestionIds.has(question.id)) {
        duplicateQuestionIds.add(question.id);
        return false;
      }
      seenQuestionIds.add(question.id);
      return true;
    });
    if (questions.length === 0) continue;
    if (questions.length === zone.questions.length) {
      dedupedZones.push(zone);
      continue;
    }

    const dedupedZone = { ...zone, questions };
    // Removing duplicates can shrink the zone to (or below) its numberChoose;
    // dropping it falls back to using every remaining question.
    if (dedupedZone.numberChoose != null && dedupedZone.numberChoose >= questions.length) {
      delete dedupedZone.numberChoose;
    }
    dedupedZones.push(dedupedZone);
  }

  return {
    zones: dedupedZones,
    warnings: [...duplicateQuestionIds].map((questionId) => ({
      questionId,
      message: DUPLICATE_ASSESSMENT_QUESTION_WARNING,
      level: 'warn',
    })),
  };
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

export function getUnresolvedSourceBankRefs(result: SerializedConversionResult): IRSourceBankRef[] {
  return result.sourceType === 'assessment' ? (result.unresolvedSourceBankRefs ?? []) : [];
}

export function hasCanvasUnresolvedSourceBankRefs(refs: IRSourceBankRef[]): boolean {
  return refs.some((ref) => ref.sourceBankExportId != null || ref.externalCourseId != null);
}

/** A selectable course instance for the import target picker. */
export interface CourseInstanceOption {
  id: string;
  shortName: string;
  longName: string;
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
  /** Count of unique questions that appeared in more than one question bank and were deduplicated. */
  deduplicatedQuestionBankQuestionCount: number;
}
