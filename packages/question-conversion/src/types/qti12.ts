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

/** A response_str element from QTI 1.2 (text-based response). */
export interface QTI12ResponseStr {
  ident: string;
  rcardinality: 'Single' | 'Multiple';
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
  responseStrs: QTI12ResponseStr[];
  correctConditions: QTI12CorrectCondition[];
  feedbacks: Map<string, string>;
  metadata: Record<string, string>;
  /** Raw parsed XML element — available for handlers that need data beyond standard fields. */
  rawItemEl?: Record<string, unknown>;
}

/** A parsed QTI 1.2 assessment or object bank. */
export interface QTI12ParsedAssessment {
  ident: string;
  title: string;
  metadata: Record<string, string>;
  items: QTI12ParsedItem[];
  sourcePath?: string;
}
