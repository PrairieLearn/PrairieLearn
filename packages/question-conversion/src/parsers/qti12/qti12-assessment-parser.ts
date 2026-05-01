import he from 'he';

import { logger } from '@prairielearn/logger';

import { createQTI12Registry } from '../../transforms/qti12/index.js';
import type { TransformRegistry } from '../../transforms/transform-registry.js';
import type {
  IRAssessment,
  IRAssessmentMeta,
  IRParseWarning,
  IRQuestion,
  IRRubric,
  IRRubricCriterion,
  IRRubricRating,
  IRZone,
} from '../../types/ir.js';
import type { QTI12ParsedAssessment, QTI12ParsedItem } from '../../types/qti12.js';
import type { InputParser, ParseOptions } from '../parser.js';

import {
  attr,
  ensureArray,
  getNestedValue,
  parseMetadata,
  parseXml,
  textContent,
} from './xml-helpers.js';
import { buildQTI12Question, parseQTI12Item } from './qti12-helpers.js';

/**
 * Parser for QTI 1.2 assessment profile XML (Canvas quiz/course exports).
 *
 * Structure: <questestinterop> → <assessment> → <section> → <item>
 * Items use response_lid with render_choice.
 */
export class QTI12AssessmentParser implements InputParser {
  readonly formatId = 'qti12-assessment';
  private registry: TransformRegistry<QTI12ParsedItem>;

  constructor(registry?: TransformRegistry<QTI12ParsedItem>) {
    this.registry = registry ?? createQTI12Registry();
  }

  canParse(xmlContent: string): boolean {
    return (
      xmlContent.includes('ims_qtiasiv1p2') &&
      (xmlContent.includes('<assessment') || xmlContent.includes(':assessment'))
    );
  }

  async parse(xmlContent: string, options?: ParseOptions): Promise<IRAssessment> {
    const parsed = parseXml(xmlContent);
    const root = parsed['questestinterop'] as Record<string, unknown> | undefined;
    if (!root) {
      throw new Error('Invalid QTI 1.2 XML: missing <questestinterop> root element');
    }

    const assessment = root['assessment'] as Record<string, unknown> | undefined;
    if (!assessment) {
      throw new Error('Invalid QTI 1.2 assessment XML: missing <assessment> element');
    }

    const parsedAssessment = this.buildParsedAssessment(assessment);
    const meta = this.parseAssessmentMeta(assessment, options);
    const allowedExtensions = this.parseAllowedExtensions(options?.assessmentMetaXml);
    const { questions, zones, parseWarnings } = await this.buildQuestionsAndZones(assessment, {
      parseOptions: options,
      shuffleAnswers: meta.shuffleAnswers,
      allowedExtensions,
    });

    const { rubric, warning: rubricWarning } = this.parseRubric(options);
    if (rubricWarning) parseWarnings.push(rubricWarning);

    return {
      sourceId: parsedAssessment.ident,
      title: parsedAssessment.title,
      questions,
      zones: zones.length > 0 ? zones : undefined,
      meta,
      rubric,
      parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
    };
  }

  private buildParsedAssessment(assessment: Record<string, unknown>): QTI12ParsedAssessment {
    const ident = attr(assessment, 'ident');
    const title = he.decode(attr(assessment, 'title'));
    const qtimetadata = assessment['qtimetadata'];
    const metadata = parseMetadata(qtimetadata);
    const items = this.collectItems(assessment).map((item) => parseQTI12Item(item));
    return { ident, title, metadata, items };
  }

  private parseAssessmentMeta(
    assessment: Record<string, unknown>,
    options?: ParseOptions,
  ): IRAssessmentMeta {
    const qtimetadata = assessment['qtimetadata'];
    const metadata = parseMetadata(qtimetadata);
    const meta: IRAssessmentMeta = {};

    const timeLimit = metadata['qmd_timelimit'];
    if (timeLimit) {
      meta.timeLimitMinutes = Number.parseInt(timeLimit, 10);
    }

    const maxAttempts = metadata['cc_maxattempts'];
    if (maxAttempts) {
      if (maxAttempts === 'unlimited') {
        meta.maxAttempts = -1;
      } else {
        const parsed = Number.parseInt(maxAttempts, 10);
        if (!Number.isNaN(parsed)) meta.maxAttempts = parsed;
      }
    }

    // Enrich with Canvas assessment_meta.xml if provided
    if (options?.assessmentMetaXml) {
      this.applyCanvasAssessmentMeta(options.assessmentMetaXml, meta, options.timezone ?? 'UTC');
    }

    // Infer assessment type: timed or single-attempt → Exam, otherwise Homework
    if (meta.timeLimitMinutes || meta.maxAttempts === 1) {
      meta.assessmentType = 'Exam';
    } else {
      meta.assessmentType = 'Homework';
    }

    return meta;
  }

  /**
   * Parse Canvas assessment_meta.xml and merge additional fields into meta.
   */
  private applyCanvasAssessmentMeta(xml: string, meta: IRAssessmentMeta, timezone: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseXml(xml);
    } catch (err) {
      logger.warn(`Failed to parse Canvas assessment_meta.xml: ${(err as Error).message}`);
      return;
    }

    // Canvas wraps in <quiz> element
    const quiz = (parsed['quiz'] ?? parsed) as Record<string, unknown>;

    const shuffleAnswers = textContent(quiz['shuffle_answers']);
    if (shuffleAnswers === 'true') {
      meta.shuffleAnswers = true;
    }

    const shuffleQuestions = textContent(quiz['shuffle_questions']);
    if (shuffleQuestions === 'true') {
      meta.shuffleQuestions = true;
    }

    // allowed_attempts: -1 = unlimited, positive = specific count
    const allowedAttempts = textContent(quiz['allowed_attempts']);
    if (allowedAttempts != null && allowedAttempts !== '') {
      const n = Number.parseInt(allowedAttempts, 10);
      if (!Number.isNaN(n)) {
        meta.maxAttempts = n; // -1 = unlimited, overrides cc_maxattempts
      }
    }

    const pointsPossible = textContent(quiz['points_possible']);
    if (pointsPossible) {
      const n = Number.parseFloat(pointsPossible);
      if (!Number.isNaN(n)) meta.pointsPossible = n;
    }

    const description = textContent(quiz['description']);
    if (description) {
      meta.descriptionHtml = he.decode(description);
    }

    // quiz_type: "assignment" → Homework, "practice_quiz" → Homework, "graded_survey" → Exam
    const quizType = textContent(quiz['quiz_type']);
    if (quizType === 'graded_survey') {
      meta.assessmentType = 'Exam';
    }

    // Time limit in minutes (assessment_meta stores it directly, QTI uses qmd_timelimit)
    const timeLimit = textContent(quiz['time_limit']);
    if (timeLimit) {
      const n = Number.parseInt(timeLimit, 10);
      if (!Number.isNaN(n) && n > 0) meta.timeLimitMinutes = n;
    }

    // Access dates — prefer lock_at over due_at as the hard close
    const lockAt = normalizeDate(textContent(quiz['lock_at']), timezone);
    const dueAt = normalizeDate(textContent(quiz['due_at']), timezone);
    if (lockAt) {
      meta.lockDate = lockAt;
    } else if (dueAt) {
      meta.lockDate = dueAt;
    }
    if (dueAt) meta.dueDate = dueAt;

    const unlockAt = normalizeDate(textContent(quiz['unlock_at']), timezone);
    if (unlockAt) meta.startDate = unlockAt;

    // Quiz password
    const accessPassword = textContent(quiz['access_code']);
    if (accessPassword) meta.accessPassword = accessPassword;

    // Correct answer visibility
    const showCorrectAnswers = textContent(quiz['show_correct_answers']);
    if (showCorrectAnswers === 'true') {
      meta.showCorrectAnswers = true;
    } else if (showCorrectAnswers === 'false') {
      meta.showCorrectAnswers = false;
    }

    const showCorrectAnswersAt = normalizeDate(
      textContent(quiz['show_correct_answers_at']),
      timezone,
    );
    if (showCorrectAnswersAt) meta.showCorrectAnswersAt = showCorrectAnswersAt;

    // hide_results: "always" means never show results to students
    const hideResults = textContent(quiz['hide_results']);
    if (hideResults === 'always') meta.hideResults = true;

    // IP filter — CIDR ranges (comma-separated in Canvas)
    const ipFilter = textContent(quiz['ip_filter']);
    if (ipFilter) meta.ipFilter = ipFilter;

    // Scoring policy
    const scoringPolicy = textContent(quiz['scoring_policy']);
    if (scoringPolicy === 'keep_highest' || scoringPolicy === 'keep_latest') {
      meta.scoringPolicy = scoringPolicy;
    }
  }

  /**
   * Parse allowed file extensions from Canvas assessment_meta.xml.
   * Canvas stores these on the <assignment><allowed_extensions> element as a
   * comma-separated list (e.g. "doc,docx,pdf"). Returns undefined when absent or empty.
   */
  private parseAllowedExtensions(assessmentMetaXml?: string): string[] | undefined {
    if (!assessmentMetaXml) return undefined;
    let parsed: Record<string, unknown>;
    try {
      parsed = parseXml(assessmentMetaXml);
    } catch (err) {
      logger.warn(
        `Failed to parse assessment_meta.xml for allowed_extensions: ${(err as Error).message}`,
      );
      return undefined;
    }
    const quiz = (parsed['quiz'] ?? parsed) as Record<string, unknown>;
    const assignment = quiz['assignment'] as Record<string, unknown> | undefined;
    if (!assignment) return undefined;
    const raw = textContent(assignment['allowed_extensions']).trim();
    if (!raw) return undefined;
    return raw
      .split(',')
      .map((ext) => ext.trim())
      .filter(Boolean);
  }

  /**
   * Build flat question list and zone structure from sections.
   * Named sub-sections under root_section become zones.
   */
  private async buildQuestionsAndZones(
    assessment: Record<string, unknown>,
    {
      parseOptions,
      shuffleAnswers,
      allowedExtensions,
    }: { parseOptions?: ParseOptions; shuffleAnswers?: boolean; allowedExtensions?: string[] },
  ): Promise<{ questions: IRQuestion[]; zones: IRZone[]; parseWarnings: IRParseWarning[] }> {
    const allQuestions: IRQuestion[] = [];
    const zones: IRZone[] = [];
    const parseWarnings: IRParseWarning[] = [];

    const rootSections = ensureArray(assessment['section'] as unknown);
    for (const rootSection of rootSections) {
      if (rootSection == null || typeof rootSection !== 'object') continue;
      const rootRec = rootSection as Record<string, unknown>;

      // Check for named sub-sections (zones)
      const subSections = ensureArray(rootRec['section'] as unknown);
      const hasNamedSubSections = subSections.some((s) => {
        if (s == null || typeof s !== 'object') return false;
        const title = attr(s as Record<string, unknown>, 'title');
        return title && title !== 'root_section';
      });

      if (hasNamedSubSections) {
        // Build zones from named sub-sections
        for (const subSection of subSections) {
          if (subSection == null || typeof subSection !== 'object') continue;
          const subRec = subSection as Record<string, unknown>;
          const zoneTitle = attr(subRec, 'title');
          const sectionPoints = this.readPointsPerItem(subRec);
          const selectionNumber = this.readSelectionNumber(subRec);
          const items = this.collectItems(subRec);
          this.warnSourcebankRefs(subRec, zoneTitle, parseWarnings);
          const questions = await this.transformItems(
            items,
            { parseOptions, shuffleAnswers, allowedExtensions, sectionPoints },
            parseWarnings,
          );
          if (questions.length > 0) {
            const numberChoose =
              selectionNumber != null && selectionNumber < questions.length
                ? selectionNumber
                : undefined;
            zones.push({
              title: zoneTitle || 'Questions',
              questions: questions.map((q) => ({
                sourceId: q.sourceId,
                points: q.points,
                gradingMethod: q.gradingMethod,
              })),
              numberChoose,
            });
            allQuestions.push(...questions);
          }
        }

        // Also collect any direct items under root_section (not in sub-sections)
        const directItems = ensureArray(rootRec['item'] as unknown).filter(
          (i): i is Record<string, unknown> => i != null && typeof i === 'object',
        );
        if (directItems.length > 0) {
          const questions = await this.transformItems(
            directItems,
            { parseOptions, shuffleAnswers, allowedExtensions },
            parseWarnings,
          );
          if (questions.length > 0) {
            zones.unshift({
              title: 'Questions',
              questions: questions.map((q) => ({
                sourceId: q.sourceId,
                points: q.points,
                gradingMethod: q.gradingMethod,
              })),
            });
            allQuestions.unshift(...questions);
          }
        }
      } else {
        // No named sub-sections — flat list
        const sectionPoints = this.readPointsPerItem(rootRec);
        const items = this.collectItems(rootRec);
        this.warnSourcebankRefs(rootRec, undefined, parseWarnings);
        const questions = await this.transformItems(
          items,
          { parseOptions, shuffleAnswers, allowedExtensions, sectionPoints },
          parseWarnings,
        );
        allQuestions.push(...questions);
      }
    }

    return { questions: allQuestions, zones, parseWarnings };
  }

  /**
   * Emit a parse warning for any <sourcebank_ref> elements found in the section.
   * Canvas quiz exports reference question banks by ID but don't include their content;
   * those questions cannot be converted without a full course export.
   */
  private warnSourcebankRefs(
    section: Record<string, unknown>,
    sectionTitle: string | undefined,
    warnings: IRParseWarning[],
  ): void {
    const subSections = ensureArray(section['section'] as unknown);
    for (const sub of subSections) {
      if (sub == null || typeof sub !== 'object') continue;
      const subRec = sub as Record<string, unknown>;
      const ref = textContent(
        getNestedValue(subRec, 'selection_ordering', 'selection', 'sourcebank_ref'),
      );
      if (ref) {
        const location = sectionTitle ? `section "${sectionTitle}"` : 'assessment';
        warnings.push({
          questionId: ref,
          message: `Question bank reference "${ref}" in ${location} cannot be resolved — question bank content is not included in QTI quiz exports. Re-export as a full course export to include question bank items.`,
        });
      }
    }
    // Also check direct sourcebank_ref in this section
    const directRef = textContent(
      getNestedValue(section, 'selection_ordering', 'selection', 'sourcebank_ref'),
    );
    if (directRef) {
      warnings.push({
        questionId: directRef,
        message: `Question bank reference "${directRef}" cannot be resolved — question bank content is not included in QTI quiz exports. Re-export as a full course export to include question bank items.`,
      });
    }
  }

  /**
   * Read the points-per-item value from a section's <selection_ordering> block.
   * Canvas stores the quiz-specific point value here; the item's own qtimetadata
   * points_possible reflects the question bank default, not the quiz override.
   */
  private readPointsPerItem(section: Record<string, unknown>): number | undefined {
    const selOrd = getNestedValue(
      section,
      'selection_ordering',
      'selection',
      'selection_extension',
    );
    if (selOrd == null || typeof selOrd !== 'object') return undefined;
    const val = Number.parseFloat(
      textContent((selOrd as Record<string, unknown>)['points_per_item']),
    );
    return Number.isNaN(val) ? undefined : val;
  }

  /**
   * Read the selection_number from a section's <selection_ordering> block.
   * When present and less than the number of items, Canvas randomly picks that
   * many questions from the section — maps to PL zone numberChoose.
   */
  private readSelectionNumber(section: Record<string, unknown>): number | undefined {
    const sel = getNestedValue(section, 'selection_ordering', 'selection');
    if (sel == null || typeof sel !== 'object') return undefined;
    const val = Number.parseInt(
      textContent((sel as Record<string, unknown>)['selection_number']),
      10,
    );
    return Number.isNaN(val) ? undefined : val;
  }

  /**
   * Parse and transform a list of raw item elements into IR questions.
   * Items that fail to transform are skipped; a warning is appended to `warnings`.
   */
  private async transformItems(
    items: Record<string, unknown>[],
    opts: {
      parseOptions?: ParseOptions;
      shuffleAnswers?: boolean;
      allowedExtensions?: string[];
      sectionPoints?: number;
    },
    warnings: IRParseWarning[],
  ): Promise<IRQuestion[]> {
    const questions: IRQuestion[] = [];
    for (const itemEl of items) {
      const item = parseQTI12Item(itemEl);
      try {
        const q = await buildQTI12Question(item, this.registry, opts, warnings);
        if (q !== null) questions.push(q);
      } catch (err) {
        warnings.push({
          questionId: item.ident,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return questions;
  }

  /** Recursively collect all items from sections (Canvas nests items in sub-sections). */
  private collectItems(parent: Record<string, unknown>): Record<string, unknown>[] {
    const items: Record<string, unknown>[] = [];

    // Direct items under this element
    const directItems = ensureArray(parent['item'] as unknown);
    items.push(
      ...directItems.filter(
        (i): i is Record<string, unknown> => i != null && typeof i === 'object',
      ),
    );

    // Recurse into sections
    const sections = ensureArray(parent['section'] as unknown);
    for (const section of sections) {
      if (section != null && typeof section === 'object') {
        items.push(...this.collectItems(section as Record<string, unknown>));
      }
    }

    return items;
  }

  /**
   * Extract rubric_identifierref from assessment_meta.xml and resolve it against
   * rubricsXml (course_settings/rubrics.xml from a full course export).
   * Returns the resolved rubric, or a warning if the ref is present but unresolvable.
   */
  private parseRubric(options?: ParseOptions): {
    rubric: IRRubric | undefined;
    warning: IRParseWarning | undefined;
  } {
    if (!options?.assessmentMetaXml) return { rubric: undefined, warning: undefined };

    const rubricRef = this.parseRubricRef(options.assessmentMetaXml);
    if (!rubricRef) return { rubric: undefined, warning: undefined };

    if (options.rubricsXml) {
      const rubric = this.findRubricById(options.rubricsXml, rubricRef);
      if (rubric) return { rubric, warning: undefined };
    }

    return {
      rubric: undefined,
      warning: {
        questionId: rubricRef,
        message: `Rubric "${rubricRef}" referenced in assessment metadata cannot be resolved — rubric definitions are not included in QTI quiz exports. Re-export as a full course export (which includes course_settings/rubrics.xml) to include rubric data.`,
      },
    };
  }

  /** Extract rubric_identifierref from Canvas assessment_meta.xml, if present. */
  private parseRubricRef(assessmentMetaXml: string): string | undefined {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseXml(assessmentMetaXml);
    } catch (err) {
      logger.warn(`Failed to parse assessment_meta.xml for rubric_ref: ${(err as Error).message}`);
      return undefined;
    }
    const quiz = (parsed['quiz'] ?? parsed) as Record<string, unknown>;
    const assignment = quiz['assignment'] as Record<string, unknown> | undefined;
    if (!assignment) return undefined;
    const ref = textContent(assignment['rubric_identifierref']).trim();
    return ref || undefined;
  }

  /** Parse course_settings/rubrics.xml and find the rubric with the given identifier. */
  private findRubricById(rubricsXml: string, id: string): IRRubric | undefined {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseXml(rubricsXml);
    } catch (err) {
      logger.warn(`Failed to parse rubrics.xml: ${(err as Error).message}`);
      return undefined;
    }
    const root = (parsed['rubrics'] ?? parsed) as Record<string, unknown>;
    const rubricEls = ensureArray(root['rubric'] as unknown);

    for (const rubricEl of rubricEls) {
      if (rubricEl == null || typeof rubricEl !== 'object') continue;
      const rubricRec = rubricEl as Record<string, unknown>;
      if (attr(rubricRec, 'identifier') !== id) continue;

      const title = textContent(rubricRec['title']);
      const pointsPossible = Number.parseFloat(textContent(rubricRec['points_possible']));
      const criteriaEl = rubricRec['criteria'] as Record<string, unknown> | undefined;
      const criterionEls = ensureArray(criteriaEl?.['criterion'] as unknown);

      const criteria: IRRubricCriterion[] = criterionEls
        .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
        .map((c) => {
          const ratingsEl = c['ratings'] as Record<string, unknown> | undefined;
          const ratingEls = ensureArray(ratingsEl?.['rating'] as unknown);
          const ratings: IRRubricRating[] = ratingEls
            .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
            .map((r) => ({
              id: textContent(r['id']),
              description: textContent(r['description']),
              points: Number.parseFloat(textContent(r['points'])) || 0,
            }));

          const longDesc = textContent(c['long_description']).trim();
          return {
            id: textContent(c['criterion_id']),
            description: textContent(c['description']),
            ...(longDesc ? { longDescription: longDesc } : {}),
            points: Number.parseFloat(textContent(c['points'])) || 0,
            ratings,
          };
        });

      return {
        id,
        title,
        pointsPossible: Number.isNaN(pointsPossible) ? 0 : pointsPossible,
        criteria,
      };
    }
    return undefined;
  }
}

/**
 * Normalize a date string to ISO 8601 local-time format expected by PrairieLearn.
 *
 * PrairieLearn interprets dates in infoAssessment.json as course-local time (no offset needed).
 *
 * Two Canvas formats:
 *  - "2025-10-29T06:00:00"      — already local time, return as-is
 *  - "2025-09-04 06:00:00 UTC"  — explicit UTC, convert to course timezone
 *
 * Returns undefined for empty/blank strings.
 */
function normalizeDate(value: string, timezone: string): string | undefined {
  if (!value) return undefined;
  // Already ISO 8601 with T separator — Canvas-local time, use as-is
  // Check that T is in position 10 (YYYY-MM-DDThh:mm:ss) to avoid false match on "UTC"
  if (value.charAt(10) === 'T') return value;
  // "YYYY-MM-DD HH:MM:SS UTC" — convert from UTC to course timezone
  const utcMatch = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/.exec(value);
  if (utcMatch) {
    const utcDate = new Date(`${utcMatch[1]}T${utcMatch[2]}Z`);
    return formatDateInTimezone(utcDate, timezone);
  }
  return undefined;
}

/**
 * Format a Date as "YYYY-MM-DDTHH:MM:SS" in the given IANA timezone.
 * Uses Intl.DateTimeFormat with en-CA locale (YYYY-MM-DD date format).
 */
function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}
