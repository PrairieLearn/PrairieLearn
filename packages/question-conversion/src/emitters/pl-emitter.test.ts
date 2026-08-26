import { assert, describe, it } from 'vitest';
import z from 'zod';

import type { IRAssessment, IRAssessmentMeta, IRQuestion } from '../types/ir.js';

import { PLEmitter } from './pl-emitter.js';

function makeAssessment(questions: IRQuestion[], meta?: IRAssessmentMeta): IRAssessment {
  return {
    sourceId: 'test-assessment',
    title: 'Test Assessment',
    sourceType: 'assessment',
    questions,
    meta,
  };
}

function makeQuestion(overrides: Partial<IRQuestion> = {}): IRQuestion {
  return {
    sourceId: 'q1',
    title: 'Test Question',
    promptHtml: '<p>What is 2+2?</p>',
    body: {
      type: 'multiple-choice',
      choices: [
        { id: 'a', html: 'Three', correct: false },
        { id: 'b', html: 'Four', correct: true },
      ],
    },
    assets: new Map(),
    gradingMethod: 'Internal',
    ...overrides,
  };
}

const emitter = new PLEmitter();

describe('PLEmitter', () => {
  it('generates stable question metadata and omits schema defaults', () => {
    const first = emitter.emit(makeAssessment([makeQuestion()]));
    const second = emitter.emit(makeAssessment([makeQuestion()]));
    assert.equal(first.questions.length, 1);
    const q = first.questions[0];
    assert.equal(q.infoJson.type, 'v3');
    assert.equal(q.infoJson.title, 'Test Question');
    assert.isTrue(q.infoJson.singleVariant);
    assert.doesNotThrow(() => z.uuid().parse(q.infoJson.uuid));
    assert.equal(q.infoJson.uuid, second.questions[0].infoJson.uuid);
    assert.notProperty(q.infoJson, 'gradingMethod');
  });

  it('preserves non-default grading methods', () => {
    const q = makeQuestion({
      body: { type: 'rich-text', gradingMethod: 'Manual' },
      gradingMethod: 'Manual',
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.equal(result.questions[0].infoJson.gradingMethod, 'Manual');
  });

  it('uses custom topic and tags from options', () => {
    const result = emitter.emit(makeAssessment([makeQuestion()]), {
      topic: 'Custom Topic',
      tags: ['custom'],
    });
    assert.equal(result.questions[0].infoJson.topic, 'Custom Topic');
    assert.deepEqual(result.questions[0].infoJson.tags, ['custom']);
  });

  describe('assessment allowAccess rules', () => {
    function emitInfo(meta?: IRAssessmentMeta) {
      return emitter.emit(makeAssessment([makeQuestion()], meta)).assessment.infoJson;
    }

    it('emits the default access rule', () => {
      assert.deepEqual(emitInfo().allowAccess, [{ credit: 100 }]);
    });

    it('applies time limits only to exams', () => {
      const exam = emitInfo({ assessmentType: 'Exam', timeLimitMinutes: 60 });
      const homework = emitInfo({ assessmentType: 'Homework', timeLimitMinutes: 30 });
      assert.equal(exam.type, 'Exam');
      assert.deepEqual(exam.allowAccess, [{ credit: 100, timeLimitMin: 60 }]);
      assert.deepEqual(homework.allowAccess, [{ credit: 100 }]);
    });

    it('maps access dates and passwords, preferring lockDate over dueDate', () => {
      const info = emitInfo({
        startDate: '2025-09-01T00:00:00',
        lockDate: '2025-09-05T05:59:59',
        dueDate: '2025-09-04T23:59:59',
        accessPassword: 'test123',
      });
      assert.deepEqual(info.allowAccess, [
        {
          credit: 100,
          startDate: '2025-09-01T00:00:00',
          endDate: '2025-09-05T05:59:59',
          password: 'test123',
        },
      ]);
      assert.deepEqual(emitInfo({ dueDate: '2025-09-04T23:59:59' }).allowAccess, [
        { credit: 100, endDate: '2025-09-04T23:59:59' },
      ]);
    });

    it('controls closed-assessment visibility', () => {
      assert.deepEqual(emitInfo({ hideResults: true }).allowAccess, [
        { credit: 100, showClosedAssessment: false },
      ]);
      assert.deepEqual(emitInfo({ showCorrectAnswers: false }).allowAccess, [
        { credit: 100, showClosedAssessment: false },
      ]);
      assert.deepEqual(emitInfo({ showCorrectAnswers: true }).allowAccess, [{ credit: 100 }]);
    });

    it('adds a delayed correct-answer visibility rule', () => {
      const rules = emitInfo({
        showCorrectAnswers: true,
        showCorrectAnswersAt: '2025-09-05T06:00:00',
        lockDate: '2025-09-05T05:59:59',
      }).allowAccess;
      assert.deepEqual(rules, [
        { credit: 100, endDate: '2025-09-05T05:59:59' },
        { showClosedAssessment: true, startDate: '2025-09-05T06:00:00' },
      ]);
    });

    it('maps assessment-level presentation metadata', () => {
      const info = emitInfo({ shuffleQuestions: true, descriptionHtml: '<p>Instructions</p>' });
      assert.isTrue(info.shuffleQuestions);
      assert.equal(info.text, '<p>Instructions</p>');
      assert.notProperty(emitInfo({ shuffleAnswers: true }), 'shuffleQuestions');
    });
  });

  it('forwards shuffleAnswers to body handlers', () => {
    const html = emitter.emit(makeAssessment([makeQuestion({ shuffleAnswers: false })]))
      .questions[0].questionHtml;
    assert.include(html, 'order="fixed"');
  });

  describe('inferSetAndNumber from title', () => {
    it.each([
      { title: 'HW 2.1', assessmentType: 'Homework' as const, set: 'Homework', number: '2.1' },
      { title: 'Midterm 2', assessmentType: 'Exam' as const, set: 'Midterm', number: '2' },
      { title: 'Final Exam', assessmentType: 'Exam' as const, set: 'Exam', number: '1' },
      { title: 'Exam 3', assessmentType: 'Exam' as const, set: 'Exam', number: '3' },
      { title: 'Quiz 5', assessmentType: 'Homework' as const, set: 'Quiz', number: '5' },
      {
        title: 'Random Assignment',
        assessmentType: 'Homework' as const,
        set: 'Homework',
        number: '1',
      },
      { title: 'Random Assignment', assessmentType: 'Exam' as const, set: 'Exam', number: '1' },
    ])('infers $set/$number from "$title"', ({ title, assessmentType, set, number }) => {
      const assessment = {
        ...makeAssessment([makeQuestion()], { assessmentType }),
        title,
      };
      const info = emitter.emit(assessment).assessment.infoJson;
      assert.equal(info.set, set);
      assert.equal(info.number, number);
    });
  });

  describe('collectClientFiles', () => {
    it('collects base64 and file-path assets', () => {
      const q = makeQuestion({
        assets: new Map([
          [
            'image.png',
            {
              type: 'base64',
              value: Buffer.from('fake').toString('base64'),
            },
          ],
          ['chart.png', { type: 'file-path', value: 'Quiz Files/chart.png' }],
        ]),
      });
      const result = emitter.emit(makeAssessment([q]));
      const files = result.questions[0].clientFiles;
      assert.deepEqual(files.get('image.png'), Buffer.from('fake'));
      assert.equal(files.get('chart.png'), 'Quiz Files/chart.png');
    });
  });

  describe('duplicate directory name deduplication', () => {
    it('preserves source IDs while deduplicating directory names', () => {
      const q1 = makeQuestion({ sourceId: 'q1', title: 'Same Title' });
      const q2 = makeQuestion({ sourceId: 'q2', title: 'Same Title' });
      const result = emitter.emit(makeAssessment([q1, q2]));
      assert.deepEqual(
        result.questions.map(({ directoryName, sourceId }) => ({ directoryName, sourceId })),
        [
          { directoryName: 'same-title', sourceId: 'q1' },
          { directoryName: 'same-title-2', sourceId: 'q2' },
        ],
      );
    });
  });

  describe('zone-based assessment', () => {
    it('emits zone titles and optional numberChoose values', () => {
      const q1 = makeQuestion({ sourceId: 'q1', title: 'First question' });
      const q2 = makeQuestion({ sourceId: 'q2', title: 'Second question' });
      const assessment: IRAssessment = {
        sourceId: 'a1',
        title: 'Zoned Assessment',
        sourceType: 'assessment',
        questions: [q1, q2],
        zones: [
          { title: 'Random pool', questions: [q1], numberChoose: 1 },
          { title: 'Part 2', questions: [q2] },
        ],
      };
      const zones = emitter.emit(assessment).assessment.infoJson.zones;
      assert.equal(zones[0].title, 'Random pool');
      assert.equal(zones[0].numberChoose, 1);
      assert.equal(zones[0].questions[0].id, 'first');
      assert.equal(zones[1].title, 'Part 2');
      assert.notProperty(zones[1], 'numberChoose');
      assert.equal(zones[1].questions[0].id, 'second');
    });
  });

  describe('question-wide feedback', () => {
    it.each([
      {
        name: 'correct-only',
        feedback: { correct: '<p>Correct response.</p>' },
        expectedSection: '{{#is_correct}}',
        unexpectedSection: '{{^is_correct}}',
      },
      {
        name: 'incorrect-only',
        feedback: { incorrect: '<p>Incorrect response.</p>' },
        expectedSection: '{{^is_correct}}',
        unexpectedSection: '{{#is_correct}}',
      },
    ])(
      'renders $name feedback for the matching score outcome',
      ({ feedback, expectedSection, unexpectedSection }) => {
        const result = emitter.emit(makeAssessment([makeQuestion({ feedback })])).questions[0];

        assert.include(result.questionHtml, '<pl-submission-panel>');
        assert.include(result.questionHtml, '{{#feedback.overall}}');
        assert.include(result.questionHtml, expectedSection);
        assert.notInclude(result.questionHtml, unexpectedSection);
        assert.include(result.questionHtml, feedback.correct ?? feedback.incorrect);
        assert.include(
          result.serverPy,
          'data["feedback"]["overall"] = {"is_correct": data["score"] >= 1.0}',
        );
      },
    );

    it('omits feedback HTML and Python when feedback is absent', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()])).questions[0];

      assert.notInclude(result.questionHtml, '<pl-submission-panel>');
      assert.notInclude(result.questionHtml, 'feedback.');
      assert.isUndefined(result.serverPy);
    });
  });

  describe('checkbox per-answer feedback', () => {
    it('safely encodes answer labels while keeping feedback HTML static', () => {
      const answer = 'A "quoted" {answer} with \\slashes\\ and\na newline';
      const feedback = '<p>Feedback with "quotes", {braces}, \\slashes\\, and\na newline.</p>';
      const q = makeQuestion({
        body: { type: 'checkbox', choices: [{ id: 'a', html: answer, correct: true }] },
        feedback: { perAnswer: { [answer]: feedback } },
      });
      const result = emitter.emit(makeAssessment([q])).questions[0];
      assert.include(result.questionHtml, feedback);
      assert.include(result.serverPy, `if ${JSON.stringify(answer)} in _selected_answer_html:`);
      assert.notInclude(result.serverPy, feedback);
    });
  });

  describe('fill-in-blanks per-blank feedback', () => {
    it('escapes answer metadata while keeping special-character feedback in static HTML', () => {
      const answerName = 'answer"\\name\n';
      const correctText = 'A <quoted> & "answer"';
      const feedback = '<p>Feedback with "quotes", {braces}, \\slashes\\, and\na newline.</p>';
      const q = makeQuestion({
        promptHtml: `<p>[${answerName}]</p>`,
        body: {
          type: 'fill-in-blanks',
          blanks: [{ id: answerName, correctText }],
        },
        feedback: { perAnswer: { [correctText]: feedback } },
      });
      const result = emitter.emit(makeAssessment([q])).questions[0];
      assert.include(
        result.questionHtml,
        `<strong>A &lt;quoted&gt; &amp; &quot;answer&quot;</strong>: ${feedback}`,
      );
      assert.include(
        result.serverPy,
        `data["partial_scores"].get(${JSON.stringify(answerName)}, {}).get("score", 0) >= 1`,
      );
      assert.notInclude(result.serverPy, correctText);
      assert.notInclude(result.serverPy, feedback);
    });
  });

  describe('calculated question rendering', () => {
    it('omits singleVariant and composes generated Python', () => {
      const q = makeQuestion({
        body: {
          type: 'calculated',
          formula: '[x]*2',
          vars: [{ name: 'x', min: 1, max: 10, decimalPlaces: 0 }],
          tolerance: 0,
          toleranceType: 'absolute',
        },
      });
      const result = emitter.emit(makeAssessment([q]));
      assert.notProperty(result.questions[0].infoJson, 'singleVariant');
      assert.include(result.questions[0].serverPy, 'def generate(data):');
    });
  });

  describe('parseWarnings propagation', () => {
    it('includes parseWarnings from assessment in result warnings', () => {
      const assessment = makeAssessment([makeQuestion()]);
      assessment.parseWarnings = [{ questionId: 'bad-q', message: 'Unsupported type' }];
      const result = emitter.emit(assessment);
      assert.deepEqual(result.warnings, [{ questionId: 'bad-q', message: 'Unsupported type' }]);
    });
  });

  describe('emission failure resilience', () => {
    function makeBadQuestion(overrides: Partial<IRQuestion> = {}): IRQuestion {
      return makeQuestion({
        ...overrides,
        body: { type: 'unsupported-type' } as unknown as IRQuestion['body'],
      });
    }

    it('excludes failed questions while preserving fallback points and warnings', () => {
      const bad = makeBadQuestion({ sourceId: 'bad-q', points: 5 });
      const good = makeQuestion({ sourceId: 'good-q', title: 'Good Question', points: 10 });
      const result = emitter.emit(makeAssessment([bad, good]));
      assert.equal(result.questions.length, 1);
      assert.equal(result.questions[0].sourceId, 'good-q');
      assert.equal(result.warnings.length, 1);
      assert.equal(result.warnings[0].questionId, 'bad-q');
      const zones = result.assessment.infoJson.zones;
      assert.equal(zones.length, 1);
      assert.equal(zones[0].questions.length, 1);
      assert.equal(zones[0].questions[0].autoPoints, 10);
    });

    it('maps zone questions correctly when first question fails', () => {
      const bad = makeBadQuestion({ sourceId: 'bad-q' });
      const good = makeQuestion({ sourceId: 'good-q', title: 'Good Question', points: 7 });
      const assessment: IRAssessment = {
        sourceId: 'a1',
        title: 'Test',
        sourceType: 'assessment',
        questions: [bad, good],
        zones: [{ title: 'Part 1', questions: [bad, good] }],
      };
      const result = emitter.emit(assessment);
      const zoneQs = result.assessment.infoJson.zones[0].questions;
      assert.equal(zoneQs.length, 1);
      assert.equal(zoneQs[0].id, result.questions[0].directoryName);
      assert.equal(zoneQs[0].autoPoints, 7);
    });

    it('emits no zones when all questions fail in single-zone fallback', () => {
      const bad1 = makeBadQuestion({ sourceId: 'bad-q1' });
      const bad2 = makeBadQuestion({ sourceId: 'bad-q2' });
      const result = emitter.emit(makeAssessment([bad1, bad2]));
      assert.equal(result.questions.length, 0);
      assert.equal(result.assessment.infoJson.zones.length, 0);
    });
  });

  describe('rubric emission', () => {
    it('emits an info warning when assessment has a rubric', () => {
      const assessment: IRAssessment = {
        ...makeAssessment([makeQuestion()]),
        rubric: {
          id: 'rub1',
          title: 'Essay Rubric',
          pointsPossible: 10,
          criteria: [],
        },
      };
      const result = emitter.emit(assessment);
      const rubricWarning = result.warnings.find((w) => w.questionId === 'rub1');
      assert.isDefined(rubricWarning);
      assert.equal(rubricWarning!.level, 'info');
      assert.include(rubricWarning!.message, 'Essay Rubric');
    });
  });
});
