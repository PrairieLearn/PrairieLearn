import he from 'he';

import { createQTI12Registry } from '../../transforms/qti12/index.js';
import { type TransformRegistry } from '../../transforms/transform-registry.js';
import type { IRAssessment, IRParseWarning, IRQuestion } from '../../types/ir.js';
import type { QTI12ParsedItem } from '../../types/qti12.js';
import type { InputParser, ParseOptions } from '../parser.js';

import {
  buildQTI12Question,
  classifyObjectBankAnswer,
  parseQTI12Item,
  synthesizeMultipleChoiceItem,
} from './qti12-helpers.js';
import { attr, ensureArray, parseMetadata, parseXml } from './xml-helpers.js';

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
      const item = this.rewriteItem(parsedItem, questionType);
      if (warning) {
        parseWarnings.push({ questionId: item.ident, message: warning });
      }

      try {
        const question = await buildQTI12Question(
          item,
          this.registry,
          {
            parseOptions: options,
            shuffleAnswers: false,
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

    const classification = classifyObjectBankAnswer(generalFb, promptText);
    if (classification.kind === 'manual') {
      return {
        questionType: 'essay_question',
        warning: `objectbank item "${item.ident}" has a non-plain answer key in general_fb; emitting as a manual rich-text question.`,
      };
    }

    if (classification.kind === 'multiple-choice') {
      return { questionType: 'multiple_choice_question' };
    }

    if (classification.kind === 'symbolic') {
      return { questionType: 'symbolic_question' };
    }

    return { questionType: 'short_answer_question' };
  }

  private rewriteItem(item: QTI12ParsedItem, questionType: string): QTI12ParsedItem {
    if (questionType !== 'multiple_choice_question') {
      return questionType === item.questionType ? item : { ...item, questionType };
    }

    const classification = classifyObjectBankAnswer(item.feedbacks.get('general_fb') ?? '');
    if (classification.kind !== 'multiple-choice') {
      return { ...item, questionType };
    }

    if (item.responseLids.some((lid) => lid.labels.length > 0)) {
      const responseLid = item.responseLids[0];
      if (!responseLid) {
        return { ...item, questionType };
      }

      const correctLabel = responseLid.labels.find(
        (label) =>
          label.ident.toUpperCase() === classification.canonicalAnswer.toUpperCase() ||
          label.text.toUpperCase() === classification.canonicalAnswer.toUpperCase(),
      );

      if (!correctLabel) {
        return { ...item, questionType };
      }

      return {
        ...item,
        questionType,
        correctConditions: [
          {
            responseIdent: responseLid.ident,
            correctLabelIdent: correctLabel.ident,
          },
        ],
      };
    }

    return synthesizeMultipleChoiceItem(
      item,
      classification.choiceOptions ?? ['A', 'B', 'C', 'D', 'E'],
      classification.canonicalAnswer,
    );
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
