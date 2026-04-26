import type { IRAssessment } from '../types/ir.js';

/** Options for parsing input content. */
export interface ParseOptions {
  /** Base directory for resolving relative file paths (e.g., images). */
  basePath?: string;
  /** Default topic to assign to questions. */
  defaultTopic?: string;
  /** Default tags to assign to questions. */
  defaultTags?: string[];
  /**
   * Raw XML content of the Canvas assessment_meta.xml file (same directory as the QTI XML).
   * When provided, the parser extracts additional metadata: shuffle_answers, allowed_attempts,
   * due_at/lock_at dates, description, and quiz_type.
   */
  assessmentMetaXml?: string;
  /**
   * IANA timezone identifier for the course (e.g. "America/Denver").
   * Used to convert explicit UTC dates (e.g. "2025-09-04 06:00:00 UTC") found in
   * Canvas metadata to the course-local time that PrairieLearn expects.
   * Defaults to "UTC" if not provided.
   */
  timezone?: string;
  /**
   * Raw XML content of the Canvas course_settings/rubrics.xml file (from a full course export).
   * When provided, the parser resolves any rubric_identifierref from assessment_meta.xml into
   * a structured IRRubric on the returned IRAssessment.
   * Without this, a rubric reference in the metadata emits a parse warning instead.
   */
  rubricsXml?: string;
}

/** Interface for format-specific input parsers. */
export interface InputParser {
  /** Format identifier, e.g., 'qti12-assessment'. */
  readonly formatId: string;
  /** Returns true if this parser can handle the given input. */
  canParse(xmlContent: string): boolean;
  /** Parse input into the format-agnostic IR. */
  parse(xmlContent: string, options?: ParseOptions): Promise<IRAssessment>;
}
