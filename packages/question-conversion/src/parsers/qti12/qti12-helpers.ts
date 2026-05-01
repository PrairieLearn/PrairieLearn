import { readFile } from 'node:fs/promises';
import path from 'node:path';

import he from 'he';
import mime from 'mime';

import type { TransformRegistry, TransformResult } from '../../transforms/transform-registry.js';
import type { AssetReference, IRFeedback, IRParseWarning, IRQuestion } from '../../types/ir.js';
import type {
  QTI12CorrectCondition,
  QTI12ParsedItem,
  QTI12ResponseLabel,
  QTI12ResponseLid,
} from '../../types/qti12.js';
import {
  cleanQuestionHtml,
  convertLatexItemizeToMarkdown,
  extractInlineImages,
  resolveImsFileRefs,
  rewriteImagesAsPlFigure,
  rewritePreAsPlCode,
} from '../../utils/html.js';
import type { ParseOptions } from '../parser.js';

import { attr, ensureArray, getNestedValue, parseMetadata, textContent } from './xml-helpers.js';

interface BuildQuestionOptions {
  parseOptions?: ParseOptions;
  shuffleAnswers?: boolean;
  allowedExtensions?: string[];
  sectionPoints?: number;
  includeGeneralFeedbackAsAnswer?: boolean;
}

const MANUAL_GRADING_QUESTION_TYPES = new Set(['rich-text', 'file-upload']);
const QUESTION_BANK_IMAGE_RE = /\[\[images\/([^\]]+)\]\]/g;
const CC_PROFILE_TO_QUESTION_TYPE: Record<string, string> = {
  'cc.multiple_choice.v0p1': 'multiple_choice_question',
  'cc.true_false.v0p1': 'true_false_question',
  'cc.multiple_response.v0p1': 'multiple_answers_question',
  'cc.essay.v0p1': 'essay_question',
  'cc.fib.v0p1': 'fill_in_multiple_blanks_question',
  'cc.short_answer.v0p1': 'short_answer_question',
  'cc.matching.v0p1': 'matching_question',
  'cc.order.v0p1': 'ordering_question',
};

/** Parse a raw QTI 1.2 item element into the shared intermediate representation. */
export function parseQTI12Item(itemEl: Record<string, unknown>): QTI12ParsedItem {
  const ident = attr(itemEl, 'ident');
  const title = he.decode(attr(itemEl, 'title'));

  const itemMetadata = getNestedValue(itemEl, 'itemmetadata', 'qtimetadata');
  const metadata = parseMetadata(itemMetadata);
  const questionType =
    metadata['question_type'] ??
    CC_PROFILE_TO_QUESTION_TYPE[metadata['cc_profile'] ?? ''] ??
    'unknown';
  const pointsPossible = metadata['points_possible']
    ? Number.parseFloat(metadata['points_possible'])
    : undefined;

  const presentation = itemEl['presentation'] as Record<string, unknown> | undefined;
  const rawPrompt = textContent(getNestedValue(presentation, 'material', 'mattext'));
  const promptHtml = convertLatexItemizeToMarkdown(cleanQuestionHtml(he.decode(rawPrompt)));

  const responseLidEls = ensureArray(presentation?.['response_lid'] as unknown);
  const responseLids = responseLidEls
    .filter((el): el is Record<string, unknown> => el != null && typeof el === 'object')
    .map((el) => parseResponseLid(el));

  const correctConditions = parseCorrectConditions(itemEl);
  const feedbacks = parseFeedbacks(itemEl);
  const resprocessing = itemEl['resprocessing'] as Record<string, unknown> | undefined;
  const calcBlock = getNestedValue(itemEl, 'itemproc_extension', 'calculated') as
    | Record<string, unknown>
    | undefined;

  return {
    ident,
    title,
    questionType,
    pointsPossible,
    promptHtml,
    responseLids,
    correctConditions,
    feedbacks,
    metadata,
    ...(calcBlock != null ? { calculatedBlock: calcBlock } : {}),
    ...(resprocessing != null ? { resprocessing } : {}),
  };
}

/** Build a PrairieLearn IR question from a parsed QTI 1.2 item. */
export async function buildQTI12Question(
  item: QTI12ParsedItem,
  registry: TransformRegistry<QTI12ParsedItem>,
  {
    parseOptions,
    shuffleAnswers,
    allowedExtensions,
    sectionPoints,
    includeGeneralFeedbackAsAnswer,
  }: BuildQuestionOptions,
  warnings: IRParseWarning[] = [],
): Promise<IRQuestion | null> {
  const handler = registry.get(item.questionType);
  if (!handler) {
    throw new Error(
      `Unsupported question type "${item.questionType}" (supported: ${registry.supportedTypes().join(', ')})`,
    );
  }

  const result: TransformResult = handler.transform(item);
  if (result.warnings) {
    for (const message of result.warnings) {
      warnings.push({ questionId: item.ident, message });
    }
  }

  const body =
    result.body.type === 'file-upload' && allowedExtensions?.length
      ? { type: 'file-upload' as const, allowedExtensions }
      : result.body;

  const {
    html: bankResolvedHtml,
    assets: bankAssets,
    warnings: bankWarnings,
  } = await resolveQuestionBankImageRefs(item.promptHtml, parseOptions?.basePath);
  for (const message of bankWarnings) {
    warnings.push({ questionId: item.ident, message });
  }

  const { html: imsResolved, fileRefs } = resolveImsFileRefs(bankResolvedHtml);
  const { html: cleanedPrompt, files } = extractInlineImages(imsResolved);
  const responsivePrompt = await rewritePreAsPlCode(rewriteImagesAsPlFigure(cleanedPrompt));

  const assets = new Map<string, AssetReference>();
  for (const [filename, asset] of bankAssets) {
    assets.set(filename, asset);
  }
  for (const [filename, relativePath] of fileRefs) {
    assets.set(filename, { type: 'file-path', value: relativePath });
  }
  for (const [filename, buffer] of files) {
    assets.set(filename, {
      type: 'base64',
      value: buffer.toString('base64'),
      contentType: mime.getType(filename) || 'application/octet-stream',
    });
  }
  if (result.assets) {
    for (const [filename, asset] of result.assets) {
      assets.set(filename, asset);
    }
  }

  const feedback = buildFeedback(item, includeGeneralFeedbackAsAnswer ?? false);
  const hasFeedback =
    feedback.correct || feedback.incorrect || feedback.general || feedback.perAnswer;

  return {
    sourceId: item.ident,
    title: item.title || item.ident,
    promptHtml: responsivePrompt,
    body,
    points: sectionPoints ?? item.pointsPossible,
    feedback: hasFeedback ? feedback : undefined,
    assets,
    metadata: {
      ...item.metadata,
      ...(parseOptions?.defaultTopic ? { topic: parseOptions.defaultTopic } : {}),
    },
    shuffleAnswers,
    gradingMethod:
      result.gradingMethod ??
      (MANUAL_GRADING_QUESTION_TYPES.has(body.type) ? 'Manual' : 'Internal'),
  };
}

function parseResponseLid(el: Record<string, unknown>): QTI12ResponseLid {
  const ident = attr(el, 'ident');
  const rcardinality = (attr(el, 'rcardinality') || 'Single') as 'Single' | 'Multiple';

  const mattext = getNestedValue(el, 'material', 'mattext');
  const rawMaterialText = textContent(mattext);
  const materialTextType = attr(mattext as Record<string, unknown>, 'texttype') || 'text/plain';
  const materialText =
    (materialTextType === 'text/html' ? he.decode(rawMaterialText) : rawMaterialText) || undefined;

  const renderChoice = el['render_choice'] as Record<string, unknown> | undefined;
  const labelEls = ensureArray(renderChoice?.['response_label'] as unknown);
  const labels: QTI12ResponseLabel[] = labelEls
    .filter((l): l is Record<string, unknown> => l != null && typeof l === 'object')
    .map((l) => {
      const mattext = getNestedValue(l, 'material', 'mattext');
      const rawText = textContent(mattext);
      const textType = attr(mattext as Record<string, unknown>, 'texttype') || 'text/plain';
      const text = textType === 'text/html' ? he.decode(rawText) : rawText;
      return { ident: attr(l, 'ident'), text, textType };
    });

  return { ident, rcardinality, materialText, labels };
}

function parseCorrectConditions(itemEl: Record<string, unknown>): QTI12CorrectCondition[] {
  const resprocessing = itemEl['resprocessing'] as Record<string, unknown> | undefined;
  if (!resprocessing) return [];

  const conditions: QTI12CorrectCondition[] = [];
  const respconditions = ensureArray(resprocessing['respcondition'] as unknown);
  for (const cond of respconditions) {
    if (cond == null || typeof cond !== 'object') continue;
    const condRec = cond as Record<string, unknown>;
    const setvar = condRec['setvar'];
    if (setvar == null) continue;
    const scoreText = textContent(setvar);
    if (!scoreText || Number.parseFloat(scoreText) <= 0) continue;

    const conditionvar = condRec['conditionvar'] as Record<string, unknown> | undefined;
    if (!conditionvar) continue;
    extractVarEquals(conditionvar, conditions, false);
  }

  return conditions;
}

function extractVarEquals(
  conditionvar: Record<string, unknown>,
  conditions: QTI12CorrectCondition[],
  negate: boolean,
): void {
  const varequals = ensureArray(conditionvar['varequal'] as unknown);
  for (const ve of varequals) {
    if (ve == null || typeof ve !== 'object') continue;
    const veRec = ve as Record<string, unknown>;
    const responseIdent = attr(veRec, 'respident');
    const correctLabelIdent = textContent(veRec);
    if (responseIdent && correctLabelIdent) {
      conditions.push({ responseIdent, correctLabelIdent, negate });
    }
  }

  const andEl = conditionvar['and'] as Record<string, unknown> | undefined;
  if (andEl) {
    extractVarEquals(andEl, conditions, negate);
  }

  const notEls = ensureArray(conditionvar['not'] as unknown);
  for (const notEl of notEls) {
    if (notEl != null && typeof notEl === 'object') {
      extractVarEquals(notEl as Record<string, unknown>, conditions, !negate);
    }
  }
}

function parseFeedbacks(itemEl: Record<string, unknown>): Map<string, string> {
  const feedbacks = new Map<string, string>();
  const fbEls = ensureArray(itemEl['itemfeedback'] as unknown);
  for (const fb of fbEls) {
    if (fb == null || typeof fb !== 'object') continue;
    const fbRec = fb as Record<string, unknown>;
    const ident = attr(fbRec, 'ident');
    if (!ident) continue;

    const text =
      textContent(getNestedValue(fbRec, 'flow_mat', 'material', 'mattext')) ||
      textContent(getNestedValue(fbRec, 'material', 'mattext'));

    feedbacks.set(ident, he.decode(text));
  }
  return feedbacks;
}

function buildFeedback(item: QTI12ParsedItem, includeGeneralAsAnswer: boolean): IRFeedback {
  const feedback: IRFeedback = {};
  const correctFbText = item.feedbacks.get('correct_fb');
  const incorrectFbText = item.feedbacks.get('general_incorrect_fb');
  const generalFbText = item.feedbacks.get('general_fb');

  if (correctFbText) feedback.correct = correctFbText;
  if (incorrectFbText) feedback.incorrect = incorrectFbText;
  if (generalFbText) feedback.general = generalFbText;

  if (includeGeneralAsAnswer && generalFbText && !feedback.correct && !feedback.incorrect) {
    feedback.correct = generalFbText;
    feedback.incorrect = generalFbText;
  }

  const perAnswer: Record<string, string> = {};
  for (const lid of item.responseLids) {
    for (const label of lid.labels) {
      const fb = item.feedbacks.get(`${label.ident}_fb`);
      if (fb) {
        perAnswer[label.text] = fb;
      }
    }
  }
  if (Object.keys(perAnswer).length > 0) {
    feedback.perAnswer = perAnswer;
  }

  return feedback;
}

async function resolveQuestionBankImageRefs(
  html: string,
  basePath?: string,
): Promise<{ html: string; assets: Map<string, AssetReference>; warnings: string[] }> {
  const warnings: string[] = [];
  const matches = [...html.matchAll(QUESTION_BANK_IMAGE_RE)];
  if (matches.length === 0) {
    return { html, assets: new Map(), warnings };
  }

  if (!basePath) {
    for (const match of matches) {
      warnings.push(
        `Could not resolve question-bank image "${match[0]}" because no basePath was provided.`,
      );
    }
    return { html, assets: new Map(), warnings };
  }

  const baseDir = path.resolve(basePath);
  const candidateDirs = [path.join(baseDir, 'images')];
  if (path.basename(baseDir).toLowerCase() === 'qti') {
    candidateDirs.push(path.join(path.dirname(baseDir), 'images'));
  }

  const usedNames = new Set<string>();
  const filenameByRel = new Map<string, string>();
  const assets = new Map<string, AssetReference>();
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const rel = decodeURIComponent(match[1]);
      let filename = filenameByRel.get(rel);
      if (!filename) {
        filename = makeUniqueFilename(path.basename(rel), usedNames);
        filenameByRel.set(rel, filename);
      }
      const resolved = await readImageFile(candidateDirs, rel);
      if (!resolved) {
        warnings.push(
          `Could not find question-bank image "${rel}" under ${candidateDirs.join(' or ')}.`,
        );
        return {
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
          replacement: match[0],
        };
      }

      assets.set(filename, {
        type: 'base64',
        value: resolved.buffer.toString('base64'),
        contentType: mime.getType(filename) || 'application/octet-stream',
      });
      return {
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        replacement: `<img src="clientFilesQuestion/${he.escape(filename)}">`,
      };
    }),
  );

  replacements.sort((a, b) => a.start - b.start);
  let rewritten = '';
  let cursor = 0;
  for (const replacement of replacements) {
    rewritten += html.slice(cursor, replacement.start) + replacement.replacement;
    cursor = replacement.end;
  }
  rewritten += html.slice(cursor);

  return { html: rewritten, assets, warnings };
}

async function readImageFile(
  candidateDirs: string[],
  relPath: string,
): Promise<{ buffer: Buffer; path: string } | null> {
  for (const dir of candidateDirs) {
    const filePath = path.resolve(dir, relPath);
    try {
      const buffer = await readFile(filePath);
      return { buffer, path: filePath };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
  return null;
}

function makeUniqueFilename(filename: string, usedNames: Set<string>): string {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }

  const dot = filename.lastIndexOf('.');
  const stem = dot !== -1 ? filename.slice(0, dot) : filename;
  const ext = dot !== -1 ? filename.slice(dot) : '';
  let index = 2;
  while (usedNames.has(`${stem}-${index}${ext}`)) index += 1;
  const unique = `${stem}-${index}${ext}`;
  usedNames.add(unique);
  return unique;
}
