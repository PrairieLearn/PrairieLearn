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
const LATEX_WRAP_RE = /^\\\((.*?)\\\)$/s;
const CHOICE_RE = /^\(?\s*([A-Ea-e])\s*\)?$/;
const NUMBER_RE = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)$/;
const INTERVAL_RE = /^\s*([([])\s*(.*?)\s*,\s*(.*?)\s*([)\]])\s*$/s;
const SYMBOLIC_WORD_RE = /[A-Za-z]+/g;
const SYMBOLIC_CHAR_RE = /[A-Za-z]/g;
const SYMBOLIC_EXCLUDED_WORDS = new Set([
  'e',
  'pi',
  'infty',
  'exp',
  'log',
  'ln',
  'sqrt',
  'factorial',
  'abs',
  'sgn',
  'max',
  'min',
  'sign',
  'cos',
  'sin',
  'tan',
  'sec',
  'cot',
  'csc',
  'cosh',
  'sinh',
  'tanh',
  'arccos',
  'arcsin',
  'arctan',
  'acos',
  'asin',
  'atan',
  'arctan2',
  'atan2',
  'atanh',
  'acosh',
  'asinh',
  'frac',
  'dfrac',
  'left',
  'right',
  'cdot',
  'times',
  'cup',
  'cap',
  'operatorname',
  'text',
  'mathrm',
  'mathbb',
  'mathbf',
]);
const ESSAY_PROMPT_MARKERS = [
  'explain',
  'why',
  'justify',
  'describe',
  'discuss',
  'in your own words',
  'using the language of limits',
  'what is the purpose',
  'what is the significance',
];
const PROSE_MARKERS = [' because ', ' since ', 'meaning', 'local maximum', 'local minimum'];
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

interface ObjectBankAnswerClassification {
  kind: 'manual' | 'short-answer' | 'multiple-choice' | 'symbolic';
  canonicalAnswer: string;
  choiceOptions?: string[];
  variables?: string[];
  allowSets?: boolean;
}

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

function normalizeObjectBankAnswerText(answerText: string): string {
  let text = he.decode(answerText.trim());
  text = text
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  while (true) {
    const match = text.match(LATEX_WRAP_RE);
    if (!match) break;
    text = match[1].trim();
  }
  return text.trim();
}

/** Port of the objectbank answer classifier heuristics used by the Python transpiler. */
export function classifyObjectBankAnswer(
  answerText: string,
  promptText?: string,
): ObjectBankAnswerClassification {
  const raw = normalizeObjectBankAnswerText(answerText);
  if (raw === '') {
    return { kind: 'manual', canonicalAnswer: raw };
  }

  if (looksExplanatory(raw) || (promptText != null && looksLikeEssayPrompt(promptText))) {
    return { kind: 'manual', canonicalAnswer: raw };
  }

  const stripped = raw;
  const lowered = stripped.toLowerCase().trim();
  if (['yes', 'y', 'no', 'n'].includes(lowered)) {
    return {
      kind: 'multiple-choice',
      canonicalAnswer: lowered.startsWith('y') ? 'yes' : 'no',
      choiceOptions: ['Yes', 'No'],
    };
  }

  if (['true', 'false'].includes(lowered)) {
    return {
      kind: 'multiple-choice',
      canonicalAnswer: lowered,
      choiceOptions: ['True', 'False'],
    };
  }

  const choiceMatch = stripped.match(CHOICE_RE);
  if (choiceMatch) {
    return {
      kind: 'multiple-choice',
      canonicalAnswer: choiceMatch[1].toUpperCase(),
      choiceOptions: ['A', 'B', 'C', 'D', 'E'],
    };
  }

  const compact = stripped.replaceAll(/\s+/g, '');
  if (NUMBER_RE.test(compact)) {
    return { kind: 'short-answer', canonicalAnswer: compact };
  }

  const interval = canonicalizeInterval(stripped);
  if (interval) {
    return {
      kind: 'symbolic',
      canonicalAnswer: interval,
      variables: extractSymbolicVariables(interval),
      allowSets: true,
    };
  }

  const symbolicTokens = [
    '\\frac',
    '\\dfrac',
    '\\sqrt',
    '\\sin',
    '\\cos',
    '\\tan',
    '\\ln',
    '\\log',
    '\\pi',
    '\\infty',
    '^',
    '_',
    '=',
    '+',
    '-',
    '/',
    '*',
  ];
  if (!stripped.includes(',') && symbolicTokens.some((token) => stripped.includes(token))) {
    const canonicalAnswer = convertSymbolicLatexCommands(stripped);
    return {
      kind: 'symbolic',
      canonicalAnswer,
      variables: extractSymbolicVariables(canonicalAnswer),
    };
  }

  return { kind: 'short-answer', canonicalAnswer: raw };
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

function looksExplanatory(answerText: string): boolean {
  const lower = answerText.toLowerCase();
  if (answerText.includes('\n')) return true;
  return PROSE_MARKERS.some((marker) => lower.includes(marker));
}

function looksLikeEssayPrompt(promptText: string): boolean {
  const lower = promptText.toLowerCase();
  return ESSAY_PROMPT_MARKERS.some((marker) => lower.includes(marker));
}

function canonicalizeInterval(answerText: string): string | null {
  const match = answerText.match(INTERVAL_RE);
  if (!match) return null;

  const [, left, lower, upper, right] = match;
  const lowerNorm = normalizeIntervalBound(lower);
  const upperNorm = normalizeIntervalBound(upper);
  return `${left} ${lowerNorm}, ${upperNorm} ${right}`;
}

function normalizeIntervalBound(boundText: string): string {
  const text = boundText.trim();
  const normalized = text.replaceAll(/\s+/g, '').toLowerCase();
  const lowerInfinityTokens = new Set(['-\\infty', '-infty', '-infinity', '-inf', '-∞', '-oo']);
  const upperInfinityTokens = new Set([
    '\\infty',
    '+\\infty',
    'infty',
    '+infty',
    'infinity',
    '+infinity',
    'inf',
    '+inf',
    '∞',
    '+∞',
    'oo',
    '+oo',
  ]);
  if (lowerInfinityTokens.has(normalized)) return '-infty';
  if (upperInfinityTokens.has(normalized)) return 'infty';
  return text;
}

export function extractSymbolicVariables(answerText: string): string[] {
  const converted = convertSymbolicLatexCommands(answerText);
  const variables: string[] = [];
  const seen = new Set<string>();

  for (const wordMatch of converted.matchAll(SYMBOLIC_WORD_RE)) {
    const word = wordMatch[0];
    if (SYMBOLIC_EXCLUDED_WORDS.has(word.toLowerCase())) continue;

    for (const charMatch of word.matchAll(SYMBOLIC_CHAR_RE)) {
      const variable = charMatch[0].toLowerCase();
      if (seen.has(variable)) continue;
      seen.add(variable);
      variables.push(variable);
    }
  }

  return variables;
}

function parseLatexBraceArgs(text: string, startIdx: number): { args: string[]; nextIdx: number } {
  const args: string[] = [];
  let idx = startIdx;

  while (idx < text.length && /\s/.test(text[idx])) idx += 1;

  while (idx < text.length && text[idx] === '{') {
    let depth = 0;
    let endIdx = idx;
    while (endIdx < text.length) {
      const char = text[endIdx];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      endIdx += 1;
    }

    if (depth !== 0 || endIdx >= text.length) {
      return { args: [], nextIdx: startIdx };
    }

    args.push(text.slice(idx + 1, endIdx).trim());
    idx = endIdx + 1;
    while (idx < text.length && /\s/.test(text[idx])) idx += 1;
  }

  if (args.length === 0) {
    return { args: [], nextIdx: startIdx };
  }

  return { args, nextIdx: idx };
}

export function convertSymbolicLatexCommands(answerText: string): string {
  try {
    let text = answerText;
    text = text.replaceAll(/\\+log_([A-Za-z0-9]+)\(([^()]+)\)/g, (_match, base, arg) => {
      return `log(${arg}, ${base})`;
    });

    const out: string[] = [];
    let idx = 0;
    while (idx < text.length) {
      if (text[idx] !== '\\') {
        out.push(text[idx]);
        idx += 1;
        continue;
      }

      let slashEnd = idx;
      while (slashEnd < text.length && text[slashEnd] === '\\') slashEnd += 1;

      const nameStart = slashEnd;
      let nameEnd = nameStart;
      while (nameEnd < text.length && /[A-Za-z]/.test(text[nameEnd])) nameEnd += 1;

      if (nameEnd === nameStart) {
        out.push(text[idx]);
        idx += 1;
        continue;
      }

      const commandName = text.slice(nameStart, nameEnd);
      const { args, nextIdx } = parseLatexBraceArgs(text, nameEnd);
      if (args.length > 0) {
        if (commandName === 'frac' && args.length === 2) {
          out.push(`(${args[0]})/(${args[1]})`);
        } else if (commandName === 'dfrac' && args.length === 2) {
          out.push(`(${args[0]})/(${args[1]})`);
        } else {
          out.push(`${commandName}(${args.join(',')})`);
        }
        idx = nextIdx;
        continue;
      }

      if (nameEnd < text.length && text[nameEnd] === '{') {
        return answerText;
      }

      out.push(text.slice(idx, nameEnd));
      idx = nameEnd;
    }

    return out.join('');
  } catch {
    return answerText;
  }
}

export function synthesizeMultipleChoiceItem(
  item: QTI12ParsedItem,
  choiceOptions: string[],
  canonicalAnswer: string,
): QTI12ParsedItem {
  const responseIdent = item.responseLids[0]?.ident || 'response1';
  const lowercasedChoices = choiceOptions.map((option) => option.toLowerCase());
  const usesLowercaseIdents = lowercasedChoices.every((option) =>
    ['yes', 'no', 'true', 'false'].includes(option),
  );
  const labels = choiceOptions.map((text) => ({
    ident: usesLowercaseIdents ? text.toLowerCase() : text,
    text,
    textType: 'text/plain',
  }));
  return {
    ...item,
    questionType: 'multiple_choice_question',
    responseLids: [
      {
        ident: responseIdent,
        rcardinality: 'Single',
        labels,
      },
    ],
    correctConditions: [
      {
        responseIdent,
        correctLabelIdent: usesLowercaseIdents ? canonicalAnswer.toLowerCase() : canonicalAnswer,
      },
    ],
  };
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
