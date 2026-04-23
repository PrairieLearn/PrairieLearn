/** A single answer choice for MC/checkbox questions. */
export interface IRChoice {
  id: string;
  html: string;
  correct: boolean;
}

/** A matching pair: left-side statement matched to a right-side option. */
export interface IRMatchPair {
  statementHtml: string;
  optionHtml: string;
}

/** A distractor option in a matching question with no correct statement. */
export interface IRMatchDistractor {
  optionHtml: string;
}

/** A fill-in-the-blank slot. */
export interface IRBlank {
  id: string;
  correctText: string;
  ignoreCase?: boolean;
}

/** A blank with dropdown choices for multiple-dropdowns questions. */
export interface IRDropdownBlank {
  id: string;
  choices: IRChoice[];
}

/** A variable definition for a calculated question. */
export interface IRCalculatedVar {
  name: string;
  min: number;
  max: number;
  decimalPlaces: number;
}

/** Numeric, non-integer answer specification. */
export interface IRNumericAnswer {
  correctValue: number;
  tolerance?: number;
  toleranceType?: 'absolute' | 'relative';
}

/** Integer answer specification. */
export interface IRIntegerAnswer {
  correctValue: number;
}

/** An item in an ordering question. */
export interface IROrderItem {
  id: string;
  html: string;
}

/** A single rating level within a rubric criterion. */
export interface IRRubricRating {
  id: string;
  description: string;
  points: number;
}

/** A single criterion in a rubric. */
export interface IRRubricCriterion {
  id: string;
  description: string;
  longDescription?: string;
  points: number;
  ratings: IRRubricRating[];
}

/** An assessment-level rubric (from Canvas course_settings/rubrics.xml). */
export interface IRRubric {
  id: string;
  title: string;
  pointsPossible: number;
  criteria: IRRubricCriterion[];
}

/** Feedback attached to a question. */
export interface IRFeedback {
  correct?: string;
  incorrect?: string;
  general?: string;
  /**
   * Per-answer feedback keyed by the answer display text (matches what PL stores
   * in data['submitted_answers']). Used for multi-select questions where multiple
   * feedbacks may need to be concatenated based on which answers were selected.
   */
  perAnswer?: Record<string, string>;
}

/** Reference to an asset (image, file) needed by the question. */
export interface AssetReference {
  type: 'file-path' | 'url' | 'base64';
  value: string;
  contentType?: string;
}

/** Discriminated union for question body types. */
export type IRQuestionBody =
  | { type: 'multiple-choice'; choices: IRChoice[]; display?: 'dropdown' }
  | { type: 'checkbox'; choices: IRChoice[] }
  | { type: 'matching'; pairs: IRMatchPair[]; distractors: IRMatchDistractor[] }
  | { type: 'fill-in-blanks'; blanks: IRBlank[] }
  | { type: 'multiple-dropdowns'; blanks: IRDropdownBlank[] }
  | { type: 'numeric'; answer: IRNumericAnswer }
  | { type: 'integer'; answer: IRIntegerAnswer }
  | { type: 'string-input'; correctAnswer: string; ignoreCase?: boolean }
  | { type: 'ordering'; correctOrder: IROrderItem[] }
  | { type: 'rich-text'; gradingMethod: 'Manual' }
  | { type: 'text-only' }
  | { type: 'file-upload'; allowedExtensions?: string[] }
  | {
      type: 'calculated';
      formula: string;
      vars: IRCalculatedVar[];
      tolerance: number;
      toleranceType: 'absolute' | 'relative';
    };

export type IRQuestionGradingMethod = 'External' | 'Internal' | 'Manual' | undefined;

/** A single converted question in IR form. */
export interface IRQuestion {
  sourceId: string;
  title: string;
  promptHtml: string;
  body: IRQuestionBody;
  points?: number;
  feedback?: IRFeedback;
  assets: Map<string, AssetReference>;
  metadata?: Record<string, string>;
  shuffleAnswers?: boolean;
  gradingMethod: IRQuestionGradingMethod;
}

/** A lightweight reference to a question within a zone. */
export interface IRZoneQuestion {
  sourceId: string;
  points?: number;
  gradingMethod?: IRQuestionGradingMethod;
}

/** A group of questions within an assessment (maps to a PL zone). */
export interface IRZone {
  title: string;
  /** Question references; full question data lives in IRAssessment.questions. */
  questions: IRZoneQuestion[];
  /** If set, only this many questions are randomly chosen from the zone. */
  numberChoose?: number;
}

/** Assessment-level metadata extracted from QTI. */
export interface IRAssessmentMeta {
  /** Time limit in minutes (from qmd_timelimit / time_limit). */
  timeLimitMinutes?: number;
  /** Maximum number of attempts (from cc_maxattempts / allowed_attempts). -1 or undefined = unlimited. */
  maxAttempts?: number;
  /** Whether answer choices should be shuffled. */
  shuffleAnswers?: boolean;
  /** Whether the order of questions should be shuffled. */
  shuffleQuestions?: boolean;
  /** Total points possible for the assessment. */
  pointsPossible?: number;
  /** Assessment description/instructions HTML. */
  descriptionHtml?: string;
  /** Whether the assessment is a timed exam vs homework-style. */
  assessmentType?: 'Homework' | 'Exam';
  /** Access start date / unlock date (ISO 8601). */
  startDate?: string;
  /** Hard close date (lock_at). Prefer over dueDate for access control. */
  lockDate?: string;
  /** Soft due date (due_at). */
  dueDate?: string;
  /** A password needed to unlock the exam. */
  accessPassword?: string;
  /** Whether to show correct answers to students after the assessment closes. */
  showCorrectAnswers?: boolean;
  /** Date after which correct answers become visible (ISO 8601). */
  showCorrectAnswersAt?: string;
  /** Whether to hide results from students entirely (hide_results: always). */
  hideResults?: boolean;
  /** IP address filter (CIDR notation, comma-separated). */
  ipFilter?: string;
  /** How to score multiple attempts: keep_highest or keep_latest. */
  scoringPolicy?: 'keep_highest' | 'keep_latest';
}

/** A warning generated during parsing. */
export interface IRParseWarning {
  questionId: string;
  message: string;
  level?: 'warn' | 'info';
}

/** A collection of questions from one source (e.g., one assessment). */
export interface IRAssessment {
  sourceId: string;
  title: string;
  /** Flat list of all questions (for backward compat / simple use). */
  questions: IRQuestion[];
  /** Questions organized by sections/zones. If present, preferred over flat `questions`. */
  zones?: IRZone[];
  /** Assessment-level metadata. */
  meta?: IRAssessmentMeta;
  /** Assessment-level rubric (resolved from course_settings/rubrics.xml when provided). */
  rubric?: IRRubric;
  /** Warnings produced during parsing (e.g., unsupported question types). */
  parseWarnings?: IRParseWarning[];
}
