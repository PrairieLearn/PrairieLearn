/** Shape of a PrairieLearn question info.json file. */
export interface PLQuestionInfoJson {
  uuid: string;
  title: string;
  topic: string;
  tags: string[];
  type: 'v3';
  singleVariant?: boolean;
  gradingMethod?: 'Internal' | 'Manual' | 'External';
}

/** All files for one PrairieLearn question directory. */
export interface PLQuestionOutput {
  /** Directory name relative to the questions folder (e.g. "imported/hw1/q1"). */
  directoryName: string;
  /** Source ID of the original IR question, used to correlate back to assessment.questions. */
  sourceId: string;
  infoJson: PLQuestionInfoJson;
  questionHtml: string;
  serverPy?: string;
  clientFiles: Map<string, Buffer | string>;
}

/** A question reference inside an assessment zone. */
export interface PLAssessmentQuestion {
  id: string;
  autoPoints?: number;
  manualPoints?: number;
}

/** A zone in a PL assessment. */
export interface PLAssessmentZone {
  title: string;
  questions: PLAssessmentQuestion[];
  /** If set, only this many questions are randomly chosen from the zone. */
  numberChoose?: number;
}

/** Shape of a PrairieLearn infoAssessment.json file. */
export interface PLAssessmentInfoJson {
  uuid: string;
  type: 'Homework' | 'Exam';
  title: string;
  set: string;
  number: string;
  allowAccess?: PLAllowAccessRule[];
  zones: PLAssessmentZone[];
  text?: string;
  shuffleQuestions?: boolean;
}

/** An access rule in infoAssessment.json. */
export interface PLAllowAccessRule {
  credit?: number;
  timeLimitMin?: number;
  startDate?: string;
  endDate?: string;
  password?: string;
  /** Whether students can view the assessment after it closes (default: true). */
  showClosedAssessment?: boolean;
}

/** Output for a PL assessment directory. */
export interface PLAssessmentOutput {
  directoryName: string;
  infoJson: PLAssessmentInfoJson;
}
