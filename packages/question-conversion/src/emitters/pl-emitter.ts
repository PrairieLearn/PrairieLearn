import type {
  IRAssessment,
  IRAssessmentMeta,
  IRFeedback,
  IRQuestion,
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

import type { BodyEmitRegistry } from './body-emit-handler.js';
import type { ConversionResult, ConversionWarning, EmitOptions, OutputEmitter } from './emitter.js';
import { createPLBodyRegistry } from './handlers/index.js';

/** Emits PrairieLearn question directories and assessment config from IR. */
export class PLEmitter implements OutputEmitter {
  private readonly registry: BodyEmitRegistry;

  constructor(registry?: BodyEmitRegistry) {
    this.registry = registry ?? createPLBodyRegistry();
  }

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
    const hwMatch = /^(homework|hw)\s*(\d[\d.]*)/i.exec(title);
    if (hwMatch) return { set: 'Homework', number: hwMatch[2] };

    const midtermMatch = /^midterm\s*#?\s*(\d+)/i.exec(title);
    if (midtermMatch) return { set: 'Midterm', number: midtermMatch[1] };

    const examMatch = /^(final\s*exam|exam)\s*#?\s*(\d*)/i.exec(title);
    if (examMatch) return { set: 'Exam', number: examMatch[2] || '1' };

    const quizMatch = /^quiz\s*#?\s*(\d+)/i.exec(title);
    if (quizMatch) return { set: 'Quiz', number: quizMatch[1] };

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
      singleVariant: question.body.type !== 'calculated',
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
    const handler = this.registry.get(question.body.type);
    if (!handler) throw new Error(`No emit handler for body type: ${question.body.type}`);

    let promptHtml = question.promptHtml;
    if (handler.transformPrompt) {
      promptHtml = handler.transformPrompt(promptHtml, question.body);
    }

    const parts: string[] = ['<pl-question-panel>', promptHtml, '</pl-question-panel>', ''];

    // Checkbox per-answer feedback is concatenated in grade() so all selected answers' messages
    // show together — PL only surfaces one feedback attribute per element, so don't put them in HTML.
    const perAnswerForHtml =
      question.body.type === 'checkbox' ? undefined : question.feedback?.perAnswer;
    const bodyHtml = handler.renderHtml(question.body, question.shuffleAnswers, perAnswerForHtml);
    if (bodyHtml) parts.push(bodyHtml);

    // Show answer panel when grade() will set data["feedback"]["general"].
    // Types with renderGradePy may produce grade output from perAnswer alone (checkbox, fill-in-blanks).
    const fb = question.feedback;
    const willHaveGrade = handler.renderGradePy
      ? fb?.correct || fb?.incorrect || (fb?.perAnswer && Object.keys(fb.perAnswer).length > 0)
      : fb?.correct || fb?.incorrect;
    if (willHaveGrade) {
      parts.push('', '<pl-answer-panel>', '{{{feedback.general}}}', '</pl-answer-panel>');
    }

    return parts.join('\n');
  }

  private renderServerPy(question: IRQuestion): string {
    const handler = this.registry.get(question.body.type);
    if (!handler) return '';

    const parts: string[] = [];

    if (handler.renderGeneratePy) {
      const gen = handler.renderGeneratePy(question.body);
      if (gen) parts.push(gen);
    }

    if (handler.renderGradePy) {
      const grade = handler.renderGradePy(question.body, question.feedback);
      if (grade) parts.push(grade);
    } else {
      const grade = renderDefaultGradeFn(question.feedback);
      if (grade) parts.push(grade);
    }

    return parts.join('\n');
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

/** Render the grade(data) function for types with only global correct/incorrect feedback. */
function renderDefaultGradeFn(feedback: IRFeedback | undefined): string {
  const { correct, incorrect } = feedback ?? {};
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
