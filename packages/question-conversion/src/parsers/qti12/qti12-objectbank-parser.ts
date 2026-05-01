import he from 'he';

import { createQTI12Registry } from '../../transforms/qti12/index.js';
import { type TransformRegistry } from '../../transforms/transform-registry.js';
import type { IRAssessment, IRParseWarning, IRQuestion } from '../../types/ir.js';
import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { InputParser, ParseOptions } from '../parser.js';

import { buildQTI12Question, parseQTI12Item } from './qti12-helpers.js';
import { attr, ensureArray, parseMetadata, parseXml } from './xml-helpers.js';

const DIRECT_ANSWER_RE = /^(?:yes|no|true|false|[-+]?\d+(?:\.\d+)?)$/i;
const EXPLANATION_PROMPT_RE =
  /\b(explain|why|justify|describe|discuss|in your own words|using the language of limits|what is the purpose|what is the significance)\b/i;

/**
 * Parser for QTI 1.2 objectbank exports.
 *
 * Structure: <questestinterop> → <objectbank> → <item>
 * These banks are flat chapter exports with essay-style prompts and authored
 * answers in general_fb.
 */
export class QTI12ObjectBankParser implements InputParser {
  readonly formatId = 'qti12-objectbank';
  private readonly registry: TransformRegistry<QTI12ParsedItem>;

  constructor(registry?: TransformRegistry<QTI12ParsedItem>) {
    this.registry = registry ?? createQTI12Registry();
  }

  canParse(xmlContent: string): boolean {
    return (
      xmlContent.includes('ims_qtiasiv1p2') &&
      (xmlContent.includes('<objectbank') || xmlContent.includes(':objectbank'))
    );
  }

  async parse(xmlContent: string, options?: ParseOptions): Promise<IRAssessment> {
    const parsed = parseXml(xmlContent);
    const root = parsed['questestinterop'] as Record<string, unknown> | undefined;
    if (!root) {
      throw new Error('Invalid QTI 1.2 XML: missing <questestinterop> root element');
    }

    const objectbank = root['objectbank'] as Record<string, unknown> | undefined;
    if (!objectbank) {
      throw new Error('Invalid QTI 1.2 object bank XML: missing <objectbank> element');
    }

    const sourceId = attr(objectbank, 'ident') || 'objectbank';
    const title = this.parseTitle(objectbank) || sourceId;
    const rawItems = this.collectItems(objectbank);

    const questions: IRQuestion[] = [];
    const parseWarnings: IRParseWarning[] = [];

    for (const rawItem of rawItems) {
      const parsedItem = parseQTI12Item(rawItem);
      const { questionType, warning } = this.classifyItem(parsedItem);
      const item =
        questionType === parsedItem.questionType ? parsedItem : { ...parsedItem, questionType };
      if (warning) {
        parseWarnings.push({ questionId: item.ident, message: warning });
      }

      try {
        const question = await buildQTI12Question(
          item,
          this.registry,
          {
            parseOptions: options,
            includeGeneralFeedbackAsAnswer: true,
          },
          parseWarnings,
        );
        if (question) questions.push(question);
      } catch (err) {
        parseWarnings.push({
          questionId: item.ident,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      sourceId,
      title,
      questions,
      parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
    };
  }

  private parseTitle(objectbank: Record<string, unknown>): string | undefined {
    const metadata = parseMetadata(objectbank['qtimetadata']);
    return metadata['bank_title'] || metadata['title'] || undefined;
  }

  private collectItems(parent: Record<string, unknown>): Record<string, unknown>[] {
    const items: Record<string, unknown>[] = [];
    const directItems = ensureArray(parent['item'] as unknown);
    items.push(
      ...directItems.filter(
        (item): item is Record<string, unknown> => item != null && typeof item === 'object',
      ),
    );

    const sections = ensureArray(parent['section'] as unknown);
    for (const section of sections) {
      if (section != null && typeof section === 'object') {
        items.push(...this.collectItems(section as Record<string, unknown>));
      }
    }
    return items;
  }

  private classifyItem(item: QTI12ParsedItem): { questionType: string; warning?: string } {
    const promptText = this.normalizeText(item.promptHtml);
    const generalFb = this.normalizeText(item.feedbacks.get('general_fb'));

    if (!generalFb) {
      return {
        questionType: 'essay_question',
        warning: `objectbank item "${item.ident}" has no general_fb answer; emitting as a manually-graded question.`,
      };
    }

    if (EXPLANATION_PROMPT_RE.test(promptText)) {
      return { questionType: 'essay_question' };
    }

    if (DIRECT_ANSWER_RE.test(generalFb)) {
      return { questionType: 'short_answer_question' };
    }

    return {
      questionType: 'essay_question',
      warning: `objectbank item "${item.ident}" has a non-plain answer key in general_fb; emitting as a manual rich-text question.`,
    };
  }

  private normalizeText(value: string | undefined): string {
    if (!value) return '';
    return he
      .decode(value)
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim()
      .replace(/^\\\((.*)\\\)$/, '$1')
      .replace(/^\\\[(.*)\\\]$/, '$1')
      .replace(/^\$(.*)\$$/, '$1')
      .trim();
  }
}
