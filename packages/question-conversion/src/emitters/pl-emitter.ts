import type {
  IRAssessment,
  IRAssessmentMeta,
  IRBlank,
  IRCalculatedVar,
  IRChoice,
  IRDropdownBlank,
  IRQuestion,
  IRQuestionBody,
  IRZone,
} from '../types/ir.js';
import type {
  PLAllowAccessRule,
  PLAssessmentInfoJson,
  PLAssessmentOutput,
  PLAssessmentQuestion,
  PLAssessmentZone,
  PLQuestionInfoJson,
  PLQuestionOutput,
} from '../types/pl-output.js';
import { slugify } from '../utils/slugify.js';
import { stableUuid } from '../utils/uuid.js';

import type { ConversionResult, ConversionWarning, EmitOptions, OutputEmitter } from './emitter.js';

/** Emits PrairieLearn question directories and assessment config from IR. */
export class PLEmitter implements OutputEmitter {
  emit(assessment: IRAssessment, options?: EmitOptions): ConversionResult {
    const questions: PLQuestionOutput[] = [];
    const warnings: ConversionWarning[] = [...(assessment.parseWarnings ?? [])];
    const usedDirNames = new Map<string, number>();

    for (let i = 0; i < assessment.questions.length; i++) {
      const question = assessment.questions[i];
      try {
        questions.push(this.emitQuestion(question, i, assessment, usedDirNames, options));
      } catch (err) {
        warnings.push({
          questionId: question.sourceId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (assessment.rubric) {
      warnings.push({
        questionId: assessment.rubric.id,
        message: `Rubric "${assessment.rubric.title}" was found but PrairieLearn does not support file-based rubrics — configure it manually in the manual grading interface.`,
        level: 'info',
      });
    }

    const assessmentOutput = this.emitAssessment(assessment, questions, options);

    return { assessmentTitle: assessment.title, assessment: assessmentOutput, questions, warnings };
  }

  private emitAssessment(
    assessment: IRAssessment,
    questions: PLQuestionOutput[],
    options?: EmitOptions,
  ): PLAssessmentOutput {
    const meta = assessment.meta;
    const assessmentType = meta?.assessmentType ?? 'Homework';
    const directoryName = slugify(assessment.title);
    const prefix = options?.questionIdPrefix ?? '';

    const uuid = stableUuid(assessment.sourceId, 'assessment');

    // Build lookups keyed by sourceId from the actually-emitted questions.
    // Using sourceId (not index) avoids misalignment when some questions fail to emit.
    const questionDirBySourceId = new Map<string, string>(
      questions.map((q) => [q.sourceId, q.directoryName]),
    );
    const questionBySourceId = new Map<string, IRQuestion>(
      assessment.questions.map((q) => [q.sourceId, q]),
    );

    // Build zones
    const zones: PLAssessmentZone[] = [];
    if (assessment.zones && assessment.zones.length > 0) {
      for (const zone of assessment.zones) {
        const zoneQuestions = this.buildZoneQuestions(zone, questionDirBySourceId, prefix);
        if (zoneQuestions.length > 0) {
          zones.push({
            title: zone.title,
            questions: zoneQuestions,
            ...(zone.numberChoose != null ? { numberChoose: zone.numberChoose } : {}),
          });
        }
      }
    } else {
      // Single zone with all questions
      const zoneQuestions: PLAssessmentQuestion[] = questions.map((q) => {
        const qIr = questionBySourceId.get(q.sourceId);
        return {
          id: prefix ? `${prefix}/${q.directoryName}` : q.directoryName,
          ...(qIr?.gradingMethod === 'Manual'
            ? { manualPoints: qIr.points }
            : { autoPoints: qIr?.points }),
        };
      });
      if (zoneQuestions.length > 0) {
        zones.push({ title: 'Questions', questions: zoneQuestions });
      }
    }

    const allowAccess = this.buildAllowAccess(meta, assessmentType);

    // Determine set and number from title
    const { set, number } = this.inferSetAndNumber(assessment.title, assessmentType);

    const infoJson: PLAssessmentInfoJson = {
      uuid,
      type: assessmentType,
      title: assessment.title,
      set,
      number,
      allowAccess,
      zones,
    };

    if (meta?.descriptionHtml) {
      infoJson.text = meta.descriptionHtml;
    }

    if (meta?.shuffleQuestions) {
      infoJson.shuffleQuestions = true;
    }

    return { directoryName, infoJson };
  }

  private buildAllowAccess(
    meta: IRAssessmentMeta | undefined,
    assessmentType: 'Homework' | 'Exam',
  ): PLAllowAccessRule[] {
    // Primary access rule — open window when the assessment is live
    const primary: PLAllowAccessRule = { credit: 100 };

    if (assessmentType === 'Exam' && meta?.timeLimitMinutes) {
      primary.timeLimitMin = meta.timeLimitMinutes;
    }

    if (meta?.startDate) primary.startDate = meta.startDate;
    if (meta?.accessPassword) primary.password = meta.accessPassword;

    // Use lockDate (hard close) as endDate; fall back to dueDate
    const endDate = meta?.lockDate ?? meta?.dueDate;
    if (endDate) primary.endDate = endDate;

    // hide_results: always → never show closed assessment to students
    // show_correct_answers: false → also hide
    if (meta?.hideResults || meta?.showCorrectAnswers === false) {
      primary.showClosedAssessment = false;
    }

    const rules: PLAllowAccessRule[] = [primary];

    // If correct answers become visible at a later date, add a second open-ended rule
    if (meta?.showCorrectAnswers && meta.showCorrectAnswersAt) {
      rules.push({
        showClosedAssessment: true,
        startDate: meta.showCorrectAnswersAt,
      });
    }

    return rules;
  }

  private buildZoneQuestions(
    zone: IRZone,
    dirBySourceId: Map<string, string>,
    prefix: string,
  ): PLAssessmentQuestion[] {
    const result: PLAssessmentQuestion[] = [];
    for (const q of zone.questions) {
      const dir = dirBySourceId.get(q.sourceId);
      if (dir) {
        result.push({
          id: prefix ? `${prefix}/${dir}` : dir,
          ...(q.gradingMethod === 'Manual' ? { manualPoints: q.points } : { autoPoints: q.points }),
        });
      }
    }
    return result;
  }

  private inferSetAndNumber(
    title: string,
    assessmentType: 'Homework' | 'Exam',
  ): { set: string; number: string } {
    // Try to extract a number from the title (e.g. "Homework 3.1" → set="Homework", number="3.1")
    const hwMatch = /^(homework|hw)\s*(\d[\d.]*)/i.exec(title);
    if (hwMatch) {
      return { set: 'Homework', number: hwMatch[2] };
    }

    const midtermMatch = /^midterm\s*#?\s*(\d+)/i.exec(title);
    if (midtermMatch) {
      return { set: 'Midterm', number: midtermMatch[1] };
    }

    const examMatch = /^(final\s*exam|exam)\s*#?\s*(\d*)/i.exec(title);
    if (examMatch) {
      return { set: 'Exam', number: examMatch[2] || '1' };
    }

    const quizMatch = /^quiz\s*#?\s*(\d+)/i.exec(title);
    if (quizMatch) {
      return { set: 'Quiz', number: quizMatch[1] };
    }

    // Fallback: use the assessment type as the set
    return { set: assessmentType, number: '1' };
  }

  private emitQuestion(
    question: IRQuestion,
    index: number,
    assessment: IRAssessment,
    usedDirNames: Map<string, number>,
    options?: EmitOptions,
  ): PLQuestionOutput {
    const directoryName = this.makeDirectoryName(question.title, index, usedDirNames);
    const topic = options?.topic ?? question.metadata?.['topic'] ?? assessment.title ?? 'Imported';
    const tags = options?.tags ?? ['imported', 'qti'];

    const uuid = stableUuid(options?.uuidNamespace ?? assessment.sourceId, question.sourceId);

    const infoJson: PLQuestionInfoJson = {
      uuid,
      title: question.title,
      topic,
      tags,
      type: 'v3',
      singleVariant: true,
      gradingMethod: question.gradingMethod,
    };

    const questionHtml = this.renderQuestionHtml(question);
    const serverPy = this.renderServerPy(question);
    const clientFiles = this.collectClientFiles(question);

    return {
      directoryName,
      sourceId: question.sourceId,
      infoJson,
      questionHtml,
      serverPy: serverPy || undefined,
      clientFiles,
    };
  }

  private makeDirectoryName(
    title: string,
    index: number,
    usedDirNames: Map<string, number>,
  ): string {
    const GENERIC_TITLES = /^(question|item|problem|unnamed)$/i;
    const cleaned = title.replaceAll(/\bquestion\b/gi, '').trim();
    const isGeneric = !cleaned || GENERIC_TITLES.test(title.trim());

    const baseDir = isGeneric ? `q${index + 1}` : slugify(cleaned);
    const count = usedDirNames.get(baseDir) ?? 0;
    usedDirNames.set(baseDir, count + 1);
    return count === 0 ? baseDir : `${baseDir}-${count + 1}`;
  }

  private renderQuestionHtml(question: IRQuestion): string {
    let promptHtml = question.promptHtml;

    // For fill-in-blanks, embed <pl-string-input> elements inline in the prompt
    // where [blankId] placeholders appear, rather than listing them separately below.
    if (question.body.type === 'fill-in-blanks') {
      promptHtml = this.inlineFillInBlanks(promptHtml, question.body.blanks);
    }
    // For multiple-dropdowns, embed <pl-dropdown> elements inline in the prompt.
    if (question.body.type === 'multiple-dropdowns') {
      promptHtml = this.inlineDropdowns(promptHtml, question.body.blanks);
    }
    // For calculated questions, replace [varname] placeholders with Mustache params.
    if (question.body.type === 'calculated') {
      promptHtml = this.replaceCalculatedVars(promptHtml, question.body.vars);
    }

    const parts: string[] = ['<pl-question-panel>', promptHtml, '</pl-question-panel>', ''];

    // For checkbox questions, per-answer feedback is concatenated in server.py grade()
    // so all selected answers' feedback is shown together. Don't put feedback attributes
    // on individual <pl-answer> elements — PL only surfaces one of them.
    const perAnswerForBody =
      question.body.type === 'checkbox' ? undefined : question.feedback?.perAnswer;
    const bodyHtml = this.renderBodyHtml(question.body, question.shuffleAnswers, perAnswerForBody);
    if (bodyHtml) {
      parts.push(bodyHtml);
    }

    const fb = question.feedback;
    const hasPerAnswerGradeFn =
      (question.body.type === 'checkbox' || question.body.type === 'fill-in-blanks') &&
      fb?.perAnswer != null &&
      Object.keys(fb.perAnswer).length > 0;
    if (fb?.correct || fb?.incorrect || hasPerAnswerGradeFn) {
      parts.push('', '<pl-answer-panel>', '{{{feedback.general}}}', '</pl-answer-panel>');
    }

    return parts.join('\n');
  }

  private inlineFillInBlanks(promptHtml: string, blanks: IRBlank[]): string {
    let result = promptHtml;
    for (const blank of blanks) {
      const input = `<pl-string-input answers-name="${escapeAttr(blank.id)}" correct-answer="${escapeAttr(blank.correctText)}" remove-leading-trailing="true"${blank.ignoreCase ? ' ignore-case="true"' : ''}></pl-string-input>`;
      result = result.replaceAll(`[${blank.id}]`, input);
    }
    return result;
  }

  private inlineDropdowns(promptHtml: string, blanks: IRDropdownBlank[]): string {
    let result = promptHtml;
    for (const blank of blanks) {
      const lines = [`<pl-dropdown answers-name="${escapeAttr(blank.id)}">`];
      for (const choice of blank.choices) {
        lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
      }
      lines.push('</pl-dropdown>');
      result = result.replaceAll(`[${blank.id}]`, lines.join('\n'));
    }
    return result;
  }

  private replaceCalculatedVars(promptHtml: string, vars: IRCalculatedVar[]): string {
    let result = promptHtml;
    for (const v of vars) {
      result = result.replaceAll(`[${v.name}]`, `{{params.${v.name}}}`);
    }
    return result;
  }

  private renderBodyHtml(
    body: IRQuestionBody,
    shuffleAnswers?: boolean,
    perAnswer?: Record<string, string>,
  ): string {
    switch (body.type) {
      case 'multiple-choice':
        return this.renderMultipleChoice(body.choices, body.display, shuffleAnswers, perAnswer);
      case 'checkbox':
        return this.renderCheckbox(body.choices, shuffleAnswers, perAnswer);
      case 'matching':
        return this.renderMatching(body);
      case 'fill-in-blanks':
        // Inputs are inlined directly into the prompt in renderQuestionHtml.
        return '';
      case 'multiple-dropdowns':
        // Dropdowns are inlined directly into the prompt in renderQuestionHtml.
        return '';
      case 'numeric':
        return `<pl-number-input answers-name="answer" correct-answer="${body.answer.correctValue}"${body.answer.tolerance != null ? ` atol="${body.answer.tolerance}"` : ''}></pl-number-input>`;
      case 'integer':
        return `<pl-integer-input answers-name="answer" correct-answer="${body.answer.correctValue}"></pl-integer-input>`;
      case 'string-input':
        return `<pl-string-input answers-name="answer" correct-answer="${escapeAttr(body.correctAnswer)}" remove-leading-trailing="true"${body.ignoreCase ? ' ignore-case="true"' : ''}></pl-string-input>`;
      case 'ordering':
        return this.renderOrdering(body);
      case 'rich-text':
        return '<pl-rich-text-editor file-name="answer.html"></pl-rich-text-editor>';
      case 'text-only':
        return '';
      case 'file-upload': {
        if (body.allowedExtensions?.length) {
          const patterns = body.allowedExtensions.map((ext) => `*.${ext}`).join(',');
          return `<pl-file-upload file-patterns="${escapeAttr(patterns)}"></pl-file-upload>`;
        }
        return '<pl-file-upload file-patterns="*"></pl-file-upload>';
      }
      case 'calculated': {
        const tolAttr =
          body.tolerance > 0
            ? body.toleranceType === 'relative'
              ? ` rtol="${body.tolerance / 100}"`
              : ` atol="${body.tolerance}"`
            : '';
        return `<pl-number-input answers-name="answer"${tolAttr}></pl-number-input>`;
      }
      default: {
        throw new Error(`Unhandled body type: ${(body as IRQuestionBody).type}`);
      }
    }
  }

  private renderMultipleChoice(
    choices: IRChoice[],
    display?: 'dropdown',
    shuffleAnswers?: boolean,
    perAnswer?: Record<string, string>,
  ): string {
    const deduped = deduplicateChoices(choices);
    if (display === 'dropdown') {
      const lines = ['<pl-dropdown answers-name="answer">'];
      for (const choice of deduped) {
        lines.push(`  <pl-answer correct="${choice.correct}">${choice.html}</pl-answer>`);
      }
      lines.push('</pl-dropdown>');
      return lines.join('\n');
    }

    const orderAttr = shuffleAnswers === false ? ' order="fixed"' : '';
    const lines = [`<pl-multiple-choice answers-name="answer"${orderAttr}>`];
    for (const choice of deduped) {
      const fb = perAnswer?.[choice.html];
      const fbAttr = fb ? ` feedback="${escapeAttr(fb)}"` : '';
      lines.push(`  <pl-answer correct="${choice.correct}"${fbAttr}>${choice.html}</pl-answer>`);
    }
    lines.push('</pl-multiple-choice>');
    return lines.join('\n');
  }

  private renderCheckbox(
    choices: IRChoice[],
    shuffleAnswers?: boolean,
    perAnswer?: Record<string, string>,
  ): string {
    const deduped = deduplicateChoices(choices);
    const orderAttr = shuffleAnswers === false ? ' order="fixed"' : '';
    const lines = [`<pl-checkbox answers-name="answer"${orderAttr}>`];
    for (const choice of deduped) {
      const fb = perAnswer?.[choice.html];
      const fbAttr = fb ? ` feedback="${escapeAttr(fb)}"` : '';
      lines.push(`  <pl-answer correct="${choice.correct}"${fbAttr}>${choice.html}</pl-answer>`);
    }
    lines.push('</pl-checkbox>');
    return lines.join('\n');
  }

  private renderMatching(body: Extract<IRQuestionBody, { type: 'matching' }>): string {
    const lines = ['<pl-matching answers-name="answer">'];
    for (const pair of body.pairs) {
      lines.push(
        `  <pl-statement match="${escapeAttr(pair.optionHtml)}">${pair.statementHtml}</pl-statement>`,
      );
    }
    for (const distractor of body.distractors) {
      lines.push(`  <pl-option>${distractor.optionHtml}</pl-option>`);
    }
    lines.push('</pl-matching>');
    return lines.join('\n');
  }

  private renderOrdering(body: Extract<IRQuestionBody, { type: 'ordering' }>): string {
    const lines = ['<pl-order-blocks answers-name="answer">'];
    for (const item of body.correctOrder) {
      lines.push(`  <pl-answer correct="true">${item.html}</pl-answer>`);
    }
    lines.push('</pl-order-blocks>');
    return lines.join('\n');
  }

  private renderServerPy(question: IRQuestion): string {
    const parts: string[] = [];

    const generateFn = this.renderGenerateFn(question);
    if (generateFn) parts.push(generateFn);

    const gradeFn = this.renderGradeFn(question);
    if (gradeFn) parts.push(gradeFn);

    return parts.join('\n');
  }

  private renderGenerateFn(question: IRQuestion): string {
    if (question.body.type !== 'calculated') return '';
    const { formula, vars, tolerance, toleranceType } = question.body;

    const pyFormula = convertFormulaToPython(formula);
    const lines = ['import math', 'import random', '', 'def generate(data):'];

    for (const v of vars) {
      lines.push(`    ${v.name} = round(random.uniform(${v.min}, ${v.max}), ${v.decimalPlaces})`);
    }
    lines.push(`    answer = ${pyFormula}`, '');
    for (const v of vars) {
      lines.push(`    data["params"]["${v.name}"] = ${v.name}`);
    }

    // Pass tolerance to PL via correct_answers — PL uses the element attributes for
    // display tolerance, but we also record it in the server so the question is self-contained.
    const tolComment =
      tolerance > 0 ? ` # tolerance: ${tolerance}${toleranceType === 'relative' ? '%' : ''}` : '';
    lines.push(`    data["correct_answers"]["answer"] = answer${tolComment}`, '');

    return lines.join('\n');
  }

  private renderGradeFn(question: IRQuestion): string {
    const { correct, incorrect, perAnswer } = question.feedback ?? {};

    // For checkbox questions, concatenate per-answer feedback for all selected answers
    // so students see all relevant feedback simultaneously (matching Canvas behaviour).
    if (
      question.body.type === 'checkbox' &&
      perAnswer != null &&
      Object.keys(perAnswer).length > 0
    ) {
      const lines = ['def grade(data):', '    _feedback_map = {'];
      for (const [answer, fb] of Object.entries(perAnswer)) {
        lines.push(`        ${JSON.stringify(answer)}: ${JSON.stringify(fb)},`);
      }
      lines.push(
        '    }',
        '    _submitted = data["submitted_answers"].get("answer") or []',
        '    _messages = [f"<strong>{a}</strong>: {_feedback_map[a]}" for a in _submitted if a in _feedback_map]',
      );
      // Append global correct/incorrect feedback after per-answer messages if present.
      appendGlobalFeedback(lines, correct, incorrect);
      lines.push(
        '    if _messages:',
        '        data["feedback"]["general"] = "<br>".join(_messages)',
        '',
      );
      return lines.join('\n');
    }

    // For fill-in-blanks questions, per-answer feedback is shown for each correctly
    // answered blank (checked via partial_scores), then global feedback is appended.
    // These are additive — getting all blanks right shows both per-blank AND global feedback.
    if (question.body.type === 'fill-in-blanks') {
      const blanksWithFeedback = question.body.blanks.filter(
        (b) => b.correctText && perAnswer?.[b.correctText] != null,
      );
      if (blanksWithFeedback.length > 0 || correct || incorrect) {
        const lines = ['def grade(data):', '    _messages = []'];
        for (const blank of blanksWithFeedback) {
          const fb = perAnswer![blank.correctText];
          lines.push(
            `    if data["partial_scores"].get(${JSON.stringify(blank.id)}, {}).get("score", 0) >= 1:`,
            `        _messages.append(f"<strong>${escapeAttr(blank.correctText)}</strong>: ${fb}")`,
          );
        }
        appendGlobalFeedback(lines, correct, incorrect);
        lines.push(
          '    if _messages:',
          '        data["feedback"]["general"] = "<br>".join(_messages)',
          '',
        );
        return lines.join('\n');
      }
    }

    // For all other question types, use global correct/incorrect feedback only.
    if (!correct && !incorrect) return '';

    const lines = ['def grade(data):'];
    if (correct && incorrect) {
      lines.push(
        '    if data["score"] >= 1.0:',
        `        data["feedback"]["general"] = ${JSON.stringify(correct)}`,
        '    else:',
        `        data["feedback"]["general"] = ${JSON.stringify(incorrect)}`,
      );
    } else if (correct) {
      lines.push(
        '    if data["score"] >= 1.0:',
        `        data["feedback"]["general"] = ${JSON.stringify(correct)}`,
      );
    } else {
      lines.push(
        '    if data["score"] < 1.0:',
        `        data["feedback"]["general"] = ${JSON.stringify(incorrect)}`,
      );
    }
    lines.push('');
    return lines.join('\n');
  }

  private collectClientFiles(question: IRQuestion): Map<string, Buffer | string> {
    const files = new Map<string, Buffer | string>();
    for (const [filename, asset] of question.assets) {
      if (asset.type === 'base64') {
        files.set(filename, Buffer.from(asset.value, 'base64'));
      } else if (asset.type === 'file-path') {
        // Store the relative path; the CLI resolves it against web_resources/ at write time
        files.set(filename, asset.value);
      }
    }
    return files;
  }
}

/**
 * Append lines to a grade() function body that set global correct/incorrect feedback
 * by appending to a `_messages` list. Both branches are independent (no short-circuit).
 */
function appendGlobalFeedback(
  lines: string[],
  correct: string | undefined,
  incorrect: string | undefined,
): void {
  if (correct && incorrect) {
    lines.push(
      '    if data["score"] >= 1.0:',
      `        _messages.append(${JSON.stringify(correct)})`,
      '    else:',
      `        _messages.append(${JSON.stringify(incorrect)})`,
    );
  } else if (correct) {
    lines.push(
      '    if data["score"] >= 1.0:',
      `        _messages.append(${JSON.stringify(correct)})`,
    );
  } else if (incorrect) {
    lines.push(
      '    if data["score"] < 1.0:',
      `        _messages.append(${JSON.stringify(incorrect)})`,
    );
  }
}

/**
 * Convert a Canvas formula string to a valid Python expression.
 *
 * Canvas uses [varname] for variable references and supports common math
 * functions. Differences from Python:
 *   - [varname]  → varname
 *   - log(x)     → math.log10(x)  (Canvas log = base-10)
 *   - ln(x)      → math.log(x)    (Canvas ln = natural log)
 *   - sqrt/sin/cos/tan/etc → math.<fn>(...)
 *   - ^          → **              (exponentiation)
 */
function convertFormulaToPython(formula: string): string {
  let py = formula.replaceAll(/\[(\w+)\]/g, '$1');
  // Use negative lookbehind to avoid re-matching already-prefixed math.log(...).
  // Replace log() first, then ln() — both use word-boundary anchors so they
  // don't collide with each other or with already-prefixed identifiers.
  py = py.replaceAll(/(?<!math\.)\blog\s*\(/g, 'math.log10(');
  py = py.replaceAll(/(?<!math\.)\bln\s*\(/g, 'math.log(');
  for (const fn of [
    'sqrt',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'exp',
    'abs',
    'ceil',
    'floor',
  ]) {
    py = py.replaceAll(new RegExp(`\\b${fn}\\s*\\(`, 'g'), `math.${fn}(`);
  }
  py = py.replaceAll('^', '**');
  return py;
}

/**
 * Remove duplicate choices by HTML text. When duplicates exist, prefer the
 * correct one so that the answer key is preserved.
 */
function deduplicateChoices(choices: IRChoice[]): IRChoice[] {
  const seen = new Map<string, IRChoice>();
  for (const choice of choices) {
    const existing = seen.get(choice.html);
    if (!existing || (!existing.correct && choice.correct)) {
      seen.set(choice.html, choice);
    }
  }
  return [...seen.values()];
}

function escapeAttr(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
