/** A single response label (answer option) in a QTI 1.2 item. */
export interface QTI12ResponseLabel {
  ident: string;
  text: string;
  textType: string;
}

/** A response_lid element from QTI 1.2 (choice-based response). */
export interface QTI12ResponseLid {
  ident: string;
  rcardinality: 'Single' | 'Multiple';
  /** Left-side label text (used in matching/FITB questions). */
  materialText?: string;
  labels: QTI12ResponseLabel[];
}

/** A condition identifying a correct answer. */
export interface QTI12CorrectCondition {
  responseIdent: string;
  correctLabelIdent: string;
  negate?: boolean;
}

/** A parsed QTI 1.2 item (question). */
export interface QTI12ParsedItem {
  ident: string;
  title: string;
  questionType: string;
  pointsPossible?: number;
  promptHtml: string;
  responseLids: QTI12ResponseLid[];
  correctConditions: QTI12CorrectCondition[];
  feedbacks: Map<string, string>;
  metadata: Record<string, string>;
  /** Parsed <calculated> block from <itemproc_extension> — populated for calculated_question items. */
  calculatedBlock?: Record<string, unknown>;
  /** Parsed <resprocessing> element — populated for numerical_question items and others that need it. */
  resprocessing?: Record<string, unknown>;
}

/** A parsed QTI 1.2 assessment or object bank. */
export interface QTI12ParsedAssessment {
  ident: string;
  title: string;
  metadata: Record<string, string>;
  items: QTI12ParsedItem[];
  sourcePath?: string;
}
