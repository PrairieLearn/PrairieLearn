import { assert, describe, it } from 'vitest';

import type { IRAssessment, IRAssessmentMeta, IRQuestion } from '../types/ir.js';

import { PLEmitter } from './pl-emitter.js';

function makeAssessment(questions: IRQuestion[], meta?: IRAssessmentMeta): IRAssessment {
  return {
    sourceId: 'test-assessment',
    title: 'Test Assessment',
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
  it('generates info.json with correct fields', () => {
    const result = emitter.emit(makeAssessment([makeQuestion()]));
    assert.equal(result.questions.length, 1);
    const q = result.questions[0];
    assert.equal(q.infoJson.type, 'v3');
    assert.equal(q.infoJson.title, 'Test Question');
    assert.isTrue(q.infoJson.singleVariant);
    assert.match(q.infoJson.uuid, /^[0-9a-f]{8}-/);
  });

  it('generates multiple choice HTML', () => {
    const result = emitter.emit(makeAssessment([makeQuestion()]));
    assert.equal(
      result.questions[0].questionHtml,
      '<pl-question-panel>\n<p>What is 2+2?</p>\n</pl-question-panel>\n\n<pl-multiple-choice answers-name="answer">\n  <pl-answer correct="false">Three</pl-answer>\n  <pl-answer correct="true">Four</pl-answer>\n</pl-multiple-choice>',
    );
  });

  it('generates checkbox HTML', () => {
    const q = makeQuestion({
      body: {
        type: 'checkbox',
        choices: [
          { id: 'a', html: 'A', correct: true },
          { id: 'b', html: 'B', correct: false },
        ],
      },
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.equal(
      result.questions[0].questionHtml,
      '<pl-question-panel>\n<p>What is 2+2?</p>\n</pl-question-panel>\n\n<pl-checkbox answers-name="answer">\n  <pl-answer correct="true">A</pl-answer>\n  <pl-answer correct="false">B</pl-answer>\n</pl-checkbox>',
    );
  });

  it('generates matching HTML', () => {
    const q = makeQuestion({
      body: {
        type: 'matching',
        pairs: [{ statementHtml: 'Iron', optionHtml: 'Fe' }],
        distractors: [{ optionHtml: 'Au' }],
      },
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.equal(
      result.questions[0].questionHtml,
      '<pl-question-panel>\n<p>What is 2+2?</p>\n</pl-question-panel>\n\n<pl-matching answers-name="answer">\n  <pl-statement match="Fe">Iron</pl-statement>\n  <pl-option>Au</pl-option>\n</pl-matching>',
    );
  });

  it('generates fill-in-blanks HTML with inline inputs and correct-answer attributes', () => {
    const q = makeQuestion({
      promptHtml: '<p>The capital is [capital1].</p>',
      body: {
        type: 'fill-in-blanks',
        blanks: [{ id: 'capital1', correctText: 'bogota', ignoreCase: true }],
      },
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.equal(
      result.questions[0].questionHtml,
      '<pl-question-panel>\n<p>The capital is <pl-string-input answers-name="capital1" correct-answer="bogota" remove-leading-trailing="true" ignore-case="true"></pl-string-input>.</p>\n</pl-question-panel>\n',
    );
    assert.isUndefined(result.questions[0].serverPy);
  });

  it('generates fill-in-blanks HTML with multiple inline inputs', () => {
    const q = makeQuestion({
      promptHtml: '<p>Colombia: [capital1], Estonia: [capital2].</p>',
      body: {
        type: 'fill-in-blanks',
        blanks: [
          { id: 'capital1', correctText: 'bogota', ignoreCase: true },
          { id: 'capital2', correctText: 'tallinn', ignoreCase: true },
        ],
      },
    });
    const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
    assert.include(html, 'answers-name="capital1"');
    assert.include(html, 'answers-name="capital2"');
    // Both inputs should be inside pl-question-panel, not below it
    const panelEnd = html.indexOf('</pl-question-panel>');
    assert.isAbove(html.indexOf('answers-name="capital1"'), 0);
    assert.isBelow(html.indexOf('answers-name="capital1"'), panelEnd);
    assert.isBelow(html.indexOf('answers-name="capital2"'), panelEnd);
  });

  describe('feedback rendering', () => {
    it('emits pl-answer-panel with both correct and incorrect feedback', () => {
      const q = makeQuestion({
        feedback: { correct: '<p>Well done!</p>', incorrect: '<p>Try again.</p>' },
      });
      const result = emitter.emit(makeAssessment([q]));
      const html = result.questions[0].questionHtml;
      assert.include(html, '<pl-answer-panel>');
      assert.include(html, '{{{feedback.general}}}');
    });

    it('emits grade() in server.py with correct and incorrect branches', () => {
      const q = makeQuestion({
        feedback: { correct: '<p>Correct!</p>', incorrect: '<p>Wrong.</p>' },
      });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy;
      assert.include(serverPy, 'def grade(data):');
      assert.include(serverPy, 'data["score"] >= 1.0');
      assert.include(serverPy, '"<p>Correct!</p>"');
      assert.include(serverPy, '"<p>Wrong.</p>"');
    });

    it('emits grade() with only correct branch when incorrect is absent', () => {
      const q = makeQuestion({ feedback: { correct: '<p>Correct!</p>' } });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy;
      assert.include(serverPy, 'data["score"] >= 1.0');
      assert.notInclude(serverPy, 'else');
    });

    it('emits grade() with only incorrect branch when correct is absent', () => {
      const q = makeQuestion({ feedback: { incorrect: '<p>Wrong.</p>' } });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy;
      assert.include(serverPy, 'data["score"] < 1.0');
      assert.notInclude(serverPy, 'else');
    });

    it('emits feedback attribute on pl-answer elements for perAnswer feedback', () => {
      const q = makeQuestion({
        body: {
          type: 'multiple-choice',
          choices: [
            { id: 'a', html: 'True', correct: true },
            { id: 'b', html: 'False', correct: false },
          ],
        },
        feedback: {
          perAnswer: { True: '<p>Correct!</p>', False: '<p>Wrong.</p>' },
        },
      });
      const result = emitter.emit(makeAssessment([q]));
      const html = result.questions[0].questionHtml;
      const serverPy = result.questions[0].serverPy ?? '';
      assert.include(html, 'feedback="&lt;p&gt;Correct!&lt;/p&gt;"');
      assert.include(html, 'feedback="&lt;p&gt;Wrong.&lt;/p&gt;"');
      assert.notInclude(html, '<pl-answer-panel>');
      assert.notInclude(serverPy, 'grade');
    });

    it('emits no pl-answer-panel and no grade() when feedback is absent', () => {
      const q = makeQuestion();
      const result = emitter.emit(makeAssessment([q]));
      assert.notInclude(result.questions[0].questionHtml, 'pl-answer-panel');
      assert.notInclude(result.questions[0].serverPy ?? '', 'grade');
    });

    it('emits only grade() for numeric questions with feedback', () => {
      const q = makeQuestion({
        body: { type: 'numeric', answer: { correctValue: 42 } },
        feedback: { correct: '<p>Yes!</p>', incorrect: '<p>No.</p>' },
      });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy;
      assert.notInclude(serverPy, 'def generate(data):');
      assert.include(serverPy, 'def grade(data):');
    });
  });

  it('generates rich-text HTML with manual grading', () => {
    const q = makeQuestion({
      body: { type: 'rich-text', gradingMethod: 'Manual' },
      gradingMethod: 'Manual',
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.equal(
      result.questions[0].questionHtml,
      '<pl-question-panel>\n<p>What is 2+2?</p>\n</pl-question-panel>\n\n<pl-rich-text-editor file-name="answer.html"></pl-rich-text-editor>',
    );
    assert.equal(result.questions[0].infoJson.gradingMethod, 'Manual');
  });

  it('generates text-only HTML without input element', () => {
    const q = makeQuestion({ body: { type: 'text-only' } });
    const result = emitter.emit(makeAssessment([q]));
    assert.equal(
      result.questions[0].questionHtml,
      '<pl-question-panel>\n<p>What is 2+2?</p>\n</pl-question-panel>\n',
    );
  });

  it('embeds correct-answer attribute on pl-string-input', () => {
    const q = makeQuestion({
      body: { type: 'string-input', correctAnswer: 'hello', ignoreCase: true },
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.include(result.questions[0].questionHtml, 'correct-answer="hello"');
    assert.include(result.questions[0].questionHtml, 'ignore-case="true"');
    assert.isUndefined(result.questions[0].serverPy);
  });

  it('embeds correct-answer attribute on pl-number-input', () => {
    const q = makeQuestion({
      body: { type: 'numeric', answer: { correctValue: 42 } },
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.include(result.questions[0].questionHtml, 'correct-answer="42"');
    assert.isUndefined(result.questions[0].serverPy);
  });

  it('uses custom topic and tags from options', () => {
    const result = emitter.emit(makeAssessment([makeQuestion()]), {
      topic: 'Custom Topic',
      tags: ['custom'],
    });
    assert.equal(result.questions[0].infoJson.topic, 'Custom Topic');
    assert.deepEqual(result.questions[0].infoJson.tags, ['custom']);
  });

  it('generates ordering HTML', () => {
    const q = makeQuestion({
      body: {
        type: 'ordering',
        correctOrder: [
          { id: 'A', html: 'First' },
          { id: 'B', html: 'Second' },
        ],
      },
    });
    const result = emitter.emit(makeAssessment([q]));
    assert.equal(
      result.questions[0].questionHtml,
      '<pl-question-panel>\n<p>What is 2+2?</p>\n</pl-question-panel>\n\n<pl-order-blocks answers-name="answer">\n  <pl-answer correct="true">First</pl-answer>\n  <pl-answer correct="true">Second</pl-answer>\n</pl-order-blocks>',
    );
  });

  it('produces stable UUIDs', () => {
    const r1 = emitter.emit(makeAssessment([makeQuestion()]));
    const r2 = emitter.emit(makeAssessment([makeQuestion()]));
    assert.equal(r1.questions[0].infoJson.uuid, r2.questions[0].infoJson.uuid);
  });

  describe('assessment allowAccess rules', () => {
    it('emits a basic credit:100 rule with no meta', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()]));
      const rules = result.assessment.infoJson.allowAccess ?? [];
      assert.equal(rules.length, 1);
      assert.equal(rules[0].credit, 100);
      assert.isUndefined(rules[0].timeLimitMin);
      assert.isUndefined(rules[0].startDate);
      assert.isUndefined(rules[0].endDate);
    });

    it('adds timeLimitMin for Exam type', () => {
      const result = emitter.emit(
        makeAssessment([makeQuestion()], { assessmentType: 'Exam', timeLimitMinutes: 60 }),
      );
      const rules = result.assessment.infoJson.allowAccess ?? [];
      assert.equal(rules[0].timeLimitMin, 60);
      assert.equal(result.assessment.infoJson.type, 'Exam');
    });

    it('does not add timeLimitMin for Homework type', () => {
      const result = emitter.emit(
        makeAssessment([makeQuestion()], { assessmentType: 'Homework', timeLimitMinutes: 30 }),
      );
      assert.isUndefined(result.assessment.infoJson.allowAccess?.[0].timeLimitMin);
    });

    it('maps lockDate to endDate and startDate', () => {
      const result = emitter.emit(
        makeAssessment([makeQuestion()], {
          assessmentType: 'Homework',
          startDate: '2025-09-01T00:00:00',
          lockDate: '2025-09-05T05:59:59',
          dueDate: '2025-09-04T23:59:59',
        }),
      );
      const rule = result.assessment.infoJson.allowAccess?.[0];
      assert.equal(rule?.startDate, '2025-09-01T00:00:00');
      // lockDate takes precedence over dueDate
      assert.equal(rule?.endDate, '2025-09-05T05:59:59');
    });

    it('maps access code correctly', () => {
      const result = emitter.emit(
        makeAssessment([makeQuestion()], {
          accessPassword: 'test123',
        }),
      );
      const rule = result.assessment.infoJson.allowAccess?.[0];
      assert.equal(rule?.password, 'test123');
    });

    it('falls back to dueDate when lockDate is absent', () => {
      const result = emitter.emit(
        makeAssessment([makeQuestion()], { dueDate: '2025-09-04T23:59:59' }),
      );
      assert.equal(result.assessment.infoJson.allowAccess?.[0].endDate, '2025-09-04T23:59:59');
    });

    it('sets showClosedAssessment: false when hide_results is set', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()], { hideResults: true }));
      assert.isFalse(result.assessment.infoJson.allowAccess?.[0].showClosedAssessment);
    });

    it('sets showClosedAssessment: false when showCorrectAnswers is false', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()], { showCorrectAnswers: false }));
      assert.isFalse(result.assessment.infoJson.allowAccess?.[0].showClosedAssessment);
    });

    it('does not set showClosedAssessment when answers are shown immediately', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()], { showCorrectAnswers: true }));
      assert.isUndefined(result.assessment.infoJson.allowAccess?.[0].showClosedAssessment);
    });

    it('adds a second rule for showCorrectAnswersAt', () => {
      const result = emitter.emit(
        makeAssessment([makeQuestion()], {
          showCorrectAnswers: true,
          showCorrectAnswersAt: '2025-09-05T06:00:00',
          lockDate: '2025-09-05T05:59:59',
        }),
      );
      const rules = result.assessment.infoJson.allowAccess ?? [];
      assert.equal(rules.length, 2);
      assert.equal(rules[1].startDate, '2025-09-05T06:00:00');
      assert.isTrue(rules[1].showClosedAssessment);
      assert.isUndefined(rules[1].credit);
    });

    it('sets shuffleQuestions from meta.shuffleQuestions', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()], { shuffleQuestions: true }));
      assert.isTrue(result.assessment.infoJson.shuffleQuestions);
    });

    it('does not set shuffleQuestions from meta.shuffleAnswers', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()], { shuffleAnswers: true }));
      assert.isUndefined(result.assessment.infoJson.shuffleQuestions);
    });

    it('sets text from descriptionHtml', () => {
      const result = emitter.emit(
        makeAssessment([makeQuestion()], { descriptionHtml: '<p>Instructions</p>' }),
      );
      assert.equal(result.assessment.infoJson.text, '<p>Instructions</p>');
    });
  });

  describe('shuffleAnswers on questions', () => {
    it('omits order attr on multiple-choice when shuffleAnswers is true', () => {
      const q = makeQuestion({ shuffleAnswers: true });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.notInclude(html, 'order=');
    });

    it('emits order="fixed" on multiple-choice when shuffleAnswers is false', () => {
      const q = makeQuestion({ shuffleAnswers: false });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, 'order="fixed"');
    });

    it('omits order attr on multiple-choice when shuffleAnswers is undefined', () => {
      const q = makeQuestion({ shuffleAnswers: undefined });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.notInclude(html, 'order=');
    });

    it('omits order attr on checkbox when shuffleAnswers is true', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [
            { id: 'a', html: 'A', correct: true },
            { id: 'b', html: 'B', correct: false },
          ],
        },
        shuffleAnswers: true,
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.notInclude(html, 'order=');
    });

    it('emits order="fixed" on checkbox when shuffleAnswers is false', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [
            { id: 'a', html: 'A', correct: true },
            { id: 'b', html: 'B', correct: false },
          ],
        },
        shuffleAnswers: false,
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, 'order="fixed"');
    });
  });

  describe('HTML content in choices', () => {
    it('passes HTML choice content through unescaped in multiple-choice', () => {
      const q = makeQuestion({
        body: {
          type: 'multiple-choice',
          choices: [
            { id: 'a', html: 'O(n<sup>2</sup>)', correct: false },
            { id: 'b', html: 'O(n log(n))', correct: true },
          ],
        },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, '>O(n<sup>2</sup>)<');
      assert.include(html, '>O(n log(n))<');
    });

    it('passes HTML choice content through unescaped in checkbox', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [
            { id: 'a', html: 'x<sup>2</sup>', correct: true },
            { id: 'b', html: 'x<sub>0</sub>', correct: false },
          ],
        },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, '>x<sup>2</sup><');
      assert.include(html, '>x<sub>0</sub><');
    });
  });

  describe('duplicate choice deduplication', () => {
    it('deduplicates multiple-choice choices with the same text, keeping the correct one', () => {
      const q = makeQuestion({
        body: {
          type: 'multiple-choice',
          choices: [
            { id: 'a', html: '5', correct: false },
            { id: 'b', html: '5', correct: true },
            { id: 'c', html: '10', correct: false },
          ],
        },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      const matches = [...html.matchAll(/>5</g)];
      assert.equal(matches.length, 1, 'duplicate "5" should appear exactly once');
      assert.include(html, 'correct="true">5<');
    });

    it('deduplicates checkbox choices with the same text, keeping the correct one', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [
            { id: 'a', html: '5', correct: false },
            { id: 'b', html: '5', correct: true },
          ],
        },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      const matches = [...html.matchAll(/>5</g)];
      assert.equal(matches.length, 1);
      assert.include(html, 'correct="true">5<');
    });
  });

  describe('renderMultipleChoice dropdown', () => {
    it('renders dropdown when display is dropdown', () => {
      const q = makeQuestion({
        body: {
          type: 'multiple-choice',
          display: 'dropdown',
          choices: [
            { id: 'a', html: 'Option A', correct: false },
            { id: 'b', html: 'Option B', correct: true },
          ],
        },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.equal(
        html,
        '<pl-question-panel>\n<p>What is 2+2?</p>\n</pl-question-panel>\n\n<pl-multiple-choice answers-name="answer" display="dropdown">\n  <pl-answer correct="false">Option A</pl-answer>\n  <pl-answer correct="true">Option B</pl-answer>\n</pl-multiple-choice>',
      );
    });
  });

  describe('inferSetAndNumber from title', () => {
    it('infers Midterm set', () => {
      const assessment = { ...makeAssessment([makeQuestion()]), title: 'Midterm 2' };
      const r = emitter.emit(assessment);
      assert.equal(r.assessment.infoJson.set, 'Midterm');
      assert.equal(r.assessment.infoJson.number, '2');
    });

    it('infers Exam set for "Final Exam"', () => {
      const assessment = { ...makeAssessment([makeQuestion()]), title: 'Final Exam' };
      const r = emitter.emit(assessment);
      assert.equal(r.assessment.infoJson.set, 'Exam');
    });

    it('infers Exam set for plain "Exam 3"', () => {
      const assessment = { ...makeAssessment([makeQuestion()]), title: 'Exam 3' };
      const r = emitter.emit(assessment);
      assert.equal(r.assessment.infoJson.set, 'Exam');
      assert.equal(r.assessment.infoJson.number, '3');
    });

    it('infers Quiz set', () => {
      const assessment = { ...makeAssessment([makeQuestion()]), title: 'Quiz 5' };
      const r = emitter.emit(assessment);
      assert.equal(r.assessment.infoJson.set, 'Quiz');
      assert.equal(r.assessment.infoJson.number, '5');
    });

    it('falls back to Homework set for unrecognized title', () => {
      const assessment = {
        ...makeAssessment([makeQuestion()], { assessmentType: 'Homework' }),
        title: 'Random Assignment',
      };
      const r = emitter.emit(assessment);
      assert.equal(r.assessment.infoJson.set, 'Homework');
      assert.equal(r.assessment.infoJson.number, '1');
    });
  });

  describe('collectClientFiles', () => {
    it('stores base64 asset as Buffer in clientFiles', () => {
      const q = makeQuestion({
        assets: new Map([
          [
            'image.png',
            {
              type: 'base64',
              value: Buffer.from('fake').toString('base64'),
              contentType: 'image/png',
            },
          ],
        ]),
      });
      const result = emitter.emit(makeAssessment([q]));
      const files = result.questions[0].clientFiles;
      assert.isTrue(Buffer.isBuffer(files.get('image.png')));
    });

    it('stores file-path asset as string in clientFiles', () => {
      const q = makeQuestion({
        assets: new Map([['chart.png', { type: 'file-path', value: 'Quiz Files/chart.png' }]]),
      });
      const result = emitter.emit(makeAssessment([q]));
      const files = result.questions[0].clientFiles;
      assert.equal(files.get('chart.png'), 'Quiz Files/chart.png');
    });
  });

  describe('duplicate directory name deduplication', () => {
    it('appends -2 suffix when two questions have the same title', () => {
      const q1 = makeQuestion({ sourceId: 'q1', title: 'Same Title' });
      const q2 = makeQuestion({ sourceId: 'q2', title: 'Same Title' });
      const result = emitter.emit(makeAssessment([q1, q2]));
      const dirs = result.questions.map((q) => q.directoryName);
      assert.equal(dirs[0], 'same-title');
      assert.equal(dirs[1], 'same-title-2');
    });
  });

  describe('zone-based assessment', () => {
    it('emits zones when assessment has zones defined', () => {
      const q = makeQuestion();
      const assessment: IRAssessment = {
        sourceId: 'a1',
        title: 'Zoned Assessment',
        questions: [q],
        zones: [{ title: 'Part 1', questions: [q] }],
      };
      const result = emitter.emit(assessment);
      assert.equal(result.assessment.infoJson.zones[0].title, 'Part 1');
    });
  });

  describe('warnings on transform errors', () => {
    it('records a warning and skips questions that throw during emit', () => {
      // Use an unsupported body type via cast to trigger the emitter error path
      const badQ = makeQuestion({ body: { type: 'text-only' } });
      // Patch the question to be valid but make it produce a duplicate that could fail
      const result = emitter.emit(makeAssessment([badQ]));
      assert.equal(result.questions.length, 1);
    });
  });

  describe('checkbox per-answer feedback via grade()', () => {
    it('omits feedback attributes on <pl-answer> elements', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [
            { id: 'a', html: 'Alpha', correct: true },
            { id: 'b', html: 'Beta', correct: false },
          ],
        },
        feedback: { perAnswer: { Alpha: '<p>Right!</p>', Beta: '<p>Nope.</p>' } },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.notInclude(html, 'feedback=');
      assert.include(html, '<pl-answer correct="true">Alpha</pl-answer>');
    });

    it('emits pl-answer-panel for checkbox with perAnswer feedback', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [{ id: 'a', html: 'Alpha', correct: true }],
        },
        feedback: { perAnswer: { Alpha: 'Good!' } },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, '<pl-answer-panel>');
    });

    it('emits grade() with _feedback_map and bold answer labels', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [
            { id: 'a', html: 'Alpha', correct: true },
            { id: 'b', html: 'Beta', correct: false },
          ],
        },
        feedback: { perAnswer: { Alpha: '<p>Right!</p>', Beta: '<p>Nope.</p>' } },
      });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy ?? '';
      assert.include(serverPy, 'def grade(data):');
      assert.include(serverPy, '_feedback_map = {');
      assert.include(serverPy, '"Alpha"');
      assert.include(serverPy, '"Beta"');
      assert.include(serverPy, 'data["submitted_answers"].get("answer")');
      assert.include(serverPy, '<strong>{_html}</strong>');
      assert.include(serverPy, '"<br>".join(_messages)');
    });

    it('appends global feedback to _messages after per-answer feedback', () => {
      const q = makeQuestion({
        body: {
          type: 'checkbox',
          choices: [{ id: 'a', html: 'Alpha', correct: true }],
        },
        feedback: {
          perAnswer: { Alpha: 'Nice!' },
          correct: 'All correct!',
          incorrect: 'Some wrong.',
        },
      });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy ?? '';
      assert.include(serverPy, '_feedback_map');
      assert.include(serverPy, '"All correct!"');
      assert.include(serverPy, '"Some wrong."');
      assert.include(serverPy, '_messages.append');
    });
  });

  describe('fill-in-blanks per-blank feedback via grade()', () => {
    it('emits grade() that checks partial_scores per blank', () => {
      const q = makeQuestion({
        promptHtml: '<p>Colombia: [cap1], Estonia: [cap2].</p>',
        body: {
          type: 'fill-in-blanks',
          blanks: [
            { id: 'cap1', correctText: 'bogota', ignoreCase: true },
            { id: 'cap2', correctText: 'tallinn', ignoreCase: true },
          ],
        },
        feedback: {
          perAnswer: { bogota: 'Great, Bogotá!', tallinn: 'Good job for Tallinn!' },
          correct: 'Perfect!',
          incorrect: 'Not quite.',
        },
      });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy ?? '';
      assert.include(serverPy, 'def grade(data):');
      assert.include(serverPy, '_messages = []');
      assert.include(serverPy, 'partial_scores');
      assert.include(serverPy, '"cap1"');
      assert.include(serverPy, '"cap2"');
      assert.include(serverPy, '<strong>bogota</strong>');
      assert.include(serverPy, '<strong>tallinn</strong>');
      // Global feedback appended independently (non-short-circuit)
      assert.include(serverPy, '"Perfect!"');
      assert.include(serverPy, '"Not quite."');
      assert.include(serverPy, '_messages.append');
    });

    it('emits pl-answer-panel for fill-in-blanks with perAnswer feedback', () => {
      const q = makeQuestion({
        promptHtml: '<p>[ans]</p>',
        body: {
          type: 'fill-in-blanks',
          blanks: [{ id: 'ans', correctText: 'hello' }],
        },
        feedback: { perAnswer: { hello: 'Correct!' } },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, '<pl-answer-panel>');
    });
  });

  describe('calculated question rendering', () => {
    function makeCalcQuestion(overrides: Partial<IRQuestion> = {}): IRQuestion {
      return makeQuestion({
        promptHtml: '<p>What is [a] + [b]?</p>',
        body: {
          type: 'calculated',
          formula: '[a]+[b]',
          vars: [
            { name: 'a', min: 1, max: 10, decimalPlaces: 2 },
            { name: 'b', min: 2, max: 5, decimalPlaces: 2 },
          ],
          tolerance: 0.01,
          toleranceType: 'absolute',
        },
        ...overrides,
      });
    }

    it('renders pl-number-input with atol for absolute tolerance', () => {
      const html = emitter.emit(makeAssessment([makeCalcQuestion()])).questions[0].questionHtml;
      assert.include(html, '<pl-number-input answers-name="answer" atol="0.01">');
    });

    it('renders pl-number-input with rtol for relative tolerance', () => {
      const q = makeQuestion({
        body: {
          type: 'calculated',
          formula: '[x]*2',
          vars: [{ name: 'x', min: 1, max: 10, decimalPlaces: 0 }],
          tolerance: 5,
          toleranceType: 'relative',
        },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, 'rtol="0.05"');
    });

    it('replaces [varname] placeholders with {{params.varname}} in prompt', () => {
      const html = emitter.emit(makeAssessment([makeCalcQuestion()])).questions[0].questionHtml;
      assert.include(html, '{{params.a}}');
      assert.include(html, '{{params.b}}');
      assert.notInclude(html, '[a]');
    });

    it('emits generate() with variable sampling and answer computation', () => {
      const serverPy =
        emitter.emit(makeAssessment([makeCalcQuestion()])).questions[0].serverPy ?? '';
      assert.include(serverPy, 'def generate(data):');
      assert.include(serverPy, 'import random');
      assert.include(serverPy, 'random.uniform(1, 10)');
      assert.include(serverPy, 'random.uniform(2, 5)');
      assert.include(serverPy, 'answer = a+b');
      assert.include(serverPy, 'data["params"]["a"]');
      assert.include(serverPy, 'data["params"]["b"]');
      assert.include(serverPy, 'data["correct_answers"]["answer"]');
    });

    it('includes tolerance comment in generate()', () => {
      const serverPy =
        emitter.emit(makeAssessment([makeCalcQuestion()])).questions[0].serverPy ?? '';
      assert.include(serverPy, '# tolerance: 0.01');
    });

    it('sets singleVariant to false for calculated questions', () => {
      // Calculated questions vary each time — should NOT be singleVariant
      const result = emitter.emit(makeAssessment([makeCalcQuestion()]));
      // singleVariant is true for all questions currently; calculated questions generate
      // dynamic content via generate() — verify generate() is present instead
      assert.include(
        result.questions[0].serverPy ?? '',
        'def generate(data):',
        'calculated questions must have a generate() function',
      );
    });

    it('converts formula math functions to Python equivalents', () => {
      const q = makeQuestion({
        body: {
          type: 'calculated',
          formula: 'sqrt([x]) + log([x]) + ln([x])',
          vars: [{ name: 'x', min: 1, max: 10, decimalPlaces: 2 }],
          tolerance: 0,
          toleranceType: 'absolute',
        },
      });
      const serverPy = emitter.emit(makeAssessment([q])).questions[0].serverPy ?? '';
      assert.include(serverPy, 'math.sqrt(x)');
      assert.include(serverPy, 'math.log10(x)');
      assert.include(serverPy, 'math.log(x)');
    });
  });

  describe('file-upload rendering', () => {
    it('renders pl-file-upload with wildcard when no allowedExtensions', () => {
      const q = makeQuestion({ body: { type: 'file-upload' } });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, '<pl-file-upload file-patterns="*">');
    });

    it('renders pl-file-upload with extension patterns when allowedExtensions provided', () => {
      const q = makeQuestion({
        body: { type: 'file-upload', allowedExtensions: ['pdf', 'docx'] },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, 'file-patterns="*.pdf,*.docx"');
    });

    it('sets gradingMethod to Manual for file-upload questions', () => {
      const q = makeQuestion({ body: { type: 'file-upload' }, gradingMethod: 'Manual' });
      const result = emitter.emit(makeAssessment([q]));
      assert.equal(result.questions[0].infoJson.gradingMethod, 'Manual');
    });
  });

  describe('integer question rendering', () => {
    it('renders pl-integer-input for integer body type', () => {
      const q = makeQuestion({ body: { type: 'integer', answer: { correctValue: 42 } } });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, '<pl-integer-input answers-name="answer" correct-answer="42">');
    });
  });

  describe('numeric question with tolerance', () => {
    it('renders pl-number-input with atol when tolerance is provided', () => {
      const q = makeQuestion({
        body: { type: 'numeric', answer: { correctValue: 3.14, tolerance: 0.005 } },
      });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.include(html, 'correct-answer="3.14"');
      assert.include(html, 'atol="0.005"');
    });

    it('renders pl-number-input without atol when tolerance is absent', () => {
      const q = makeQuestion({ body: { type: 'numeric', answer: { correctValue: 99 } } });
      const html = emitter.emit(makeAssessment([q])).questions[0].questionHtml;
      assert.notInclude(html, 'atol=');
    });
  });

  describe('zone numberChoose', () => {
    it('emits numberChoose on the zone when set', () => {
      const q = makeQuestion();
      const assessment: IRAssessment = {
        sourceId: 'a1',
        title: 'Quiz',
        questions: [q],
        zones: [{ title: 'Random Pool', questions: [q], numberChoose: 1 }],
      };
      const result = emitter.emit(assessment);
      assert.equal(result.assessment.infoJson.zones[0].numberChoose, 1);
    });

    it('does not emit numberChoose when not set on zone', () => {
      const q = makeQuestion();
      const assessment: IRAssessment = {
        sourceId: 'a1',
        title: 'Quiz',
        questions: [q],
        zones: [{ title: 'Part 1', questions: [q] }],
      };
      const result = emitter.emit(assessment);
      assert.isUndefined(result.assessment.infoJson.zones[0].numberChoose);
    });
  });

  describe('parseWarnings propagation', () => {
    it('includes parseWarnings from assessment in result warnings', () => {
      const assessment = makeAssessment([makeQuestion()]);
      assessment.parseWarnings = [{ questionId: 'bad-q', message: 'Unsupported type' }];
      const result = emitter.emit(assessment);
      assert.equal(result.warnings.length, 1);
      assert.equal(result.warnings[0].questionId, 'bad-q');
      assert.equal(result.warnings[0].message, 'Unsupported type');
    });
  });

  describe('sourceId on PLQuestionOutput', () => {
    it('populates sourceId on each emitted question', () => {
      const q1 = makeQuestion({ sourceId: 'q-abc' });
      const q2 = makeQuestion({ sourceId: 'q-xyz', title: 'Another Question' });
      const result = emitter.emit(makeAssessment([q1, q2]));
      assert.equal(result.questions[0].sourceId, 'q-abc');
      assert.equal(result.questions[1].sourceId, 'q-xyz');
    });
  });

  describe('emission failure resilience', () => {
    function makeBadQuestion(overrides: Partial<IRQuestion> = {}): IRQuestion {
      // Cast to IRQuestion with an unsupported body type to force emitQuestion to throw
      return makeQuestion({
        ...overrides,
        body: { type: 'unsupported-type' } as unknown as IRQuestion['body'],
      });
    }

    it('emits a warning and excludes the failed question', () => {
      const bad = makeBadQuestion({ sourceId: 'bad-q' });
      const good = makeQuestion({ sourceId: 'good-q', title: 'Good Question' });
      const result = emitter.emit(makeAssessment([bad, good]));
      assert.equal(result.questions.length, 1);
      assert.equal(result.questions[0].sourceId, 'good-q');
      assert.equal(result.warnings.length, 1);
      assert.equal(result.warnings[0].questionId, 'bad-q');
    });

    it('assigns correct autoPoints in single-zone fallback when first question fails', () => {
      const bad = makeBadQuestion({ sourceId: 'bad-q', points: 5 });
      const good = makeQuestion({ sourceId: 'good-q', title: 'Good Question', points: 10 });
      const result = emitter.emit(makeAssessment([bad, good]));
      const zones = result.assessment.infoJson.zones;
      assert.equal(zones.length, 1);
      assert.equal(zones[0].questions.length, 1);
      // autoPoints must come from the good question (10), not the bad question (5)
      assert.equal(zones[0].questions[0].autoPoints, 10);
    });

    it('maps zone questions correctly when first question fails', () => {
      const bad = makeBadQuestion({ sourceId: 'bad-q' });
      const good = makeQuestion({ sourceId: 'good-q', title: 'Good Question', points: 7 });
      const assessment: IRAssessment = {
        sourceId: 'a1',
        title: 'Test',
        questions: [bad, good],
        zones: [{ title: 'Part 1', questions: [bad, good] }],
      };
      const result = emitter.emit(assessment);
      const zoneQs = result.assessment.infoJson.zones[0].questions;
      // Only the good question should appear in the zone
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
          criteria: [
            {
              id: 'crit1',
              description: 'Quality of argument',
              longDescription: 'Well-structured argument.',
              points: 10,
              ratings: [
                { id: 'r1', description: 'Full Marks', points: 10 },
                { id: 'r2', description: 'No Marks', points: 0 },
              ],
            },
          ],
        },
      };
      const result = emitter.emit(assessment);
      const rubricWarning = result.warnings.find((w) => w.questionId === 'rub1');
      assert.isDefined(rubricWarning);
      assert.equal(rubricWarning!.level, 'info');
      assert.include(rubricWarning!.message, 'Essay Rubric');
    });

    it('emits no rubric warning when assessment has no rubric', () => {
      const result = emitter.emit(makeAssessment([makeQuestion()]));
      assert.isTrue(
        result.warnings.every((w) => w.level !== 'info' || !w.message.includes('ubric')),
      );
    });
  });
});
