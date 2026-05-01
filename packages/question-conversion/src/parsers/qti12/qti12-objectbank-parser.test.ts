import { readFileSync } from 'node:fs';
import path from 'node:path';

import { assert, describe, it } from 'vitest';

import {
  classifyObjectBankAnswer,
  convertSymbolicLatexCommands,
  extractSymbolicVariables,
} from './qti12-helpers.js';
import { QTI12ObjectBankParser } from './qti12-objectbank-parser.js';

const FIXTURES = path.join(import.meta.dirname, '../../test-fixtures/qti12');
const parser = new QTI12ObjectBankParser();

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), 'utf-8');
}

describe('QTI12ObjectBankParser', () => {
  it('can parse objectbank XML', () => {
    assert.isTrue(parser.canParse(readFixture('objectbank-sample.xml')));
    assert.isFalse(parser.canParse('<questestinterop><assessment/></questestinterop>'));
  });

  it('extracts the bank title', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });
    assert.equal(result.sourceId, 'sample_bank');
    assert.equal(result.title, 'Sample Chapter Bank');
  });

  it('classifies direct-answer items as auto-graded multiple-choice questions', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });

    const q1 = result.questions.find((question) => question.sourceId === 'q1_yes');
    assert.isDefined(q1);
    if (!q1) return;
    assert.equal(q1.body.type, 'multiple-choice');
    assert.equal(q1.gradingMethod, 'Internal');
    if (q1.body.type !== 'multiple-choice') return;
    assert.deepEqual(
      q1.body.choices.map((choice) => choice.html),
      ['Yes', 'No'],
    );
    assert.deepEqual(
      q1.body.choices.map((choice) => choice.correct),
      [true, false],
    );
    assert.equal(q1.shuffleAnswers, false);
  });

  it('keeps explanation-style items manual', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });

    const question = result.questions.find((q) => q.sourceId === 'q2_explain');
    assert.isDefined(question);
    if (!question) return;
    assert.equal(question.body.type, 'rich-text');
    assert.equal(question.gradingMethod, 'Manual');
    assert.include(question.promptHtml, 'Why does this process work?');
    assert.include(question.feedback?.general ?? '', 'Lorem ipsum dolor sit amet');
  });

  it('infers symbolic inputs from latex answers', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });

    const question = result.questions.find((q) => q.sourceId === 'q4_symbolic');
    assert.isDefined(question);
    if (!question) return;
    assert.equal(question.body.type, 'symbolic');
    assert.equal(question.gradingMethod, 'Internal');
    if (question.body.type !== 'symbolic') return;
    assert.deepEqual(question.body.variables, ['x', 'y']);
    assert.equal(question.body.correctAnswer, '(x+1)/(y)');
    assert.isUndefined(question.body.allowSets);
  });

  it('names choice options as A through E when the answer key is a letter', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });

    const question = result.questions.find((q) => q.sourceId === 'q5_choice');
    assert.isDefined(question);
    if (!question) return;
    assert.equal(question.body.type, 'multiple-choice');
    if (question.body.type !== 'multiple-choice') return;
    assert.deepEqual(
      question.body.choices.map((choice) => choice.html),
      ['A', 'B', 'C', 'D', 'E'],
    );
    assert.deepEqual(
      question.body.choices.map((choice) => choice.correct),
      [false, false, true, false, false],
    );
  });

  it('resolves question-bank image placeholders from the question-bank root', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });

    const question = result.questions.find((q) => q.sourceId === 'q3_image');
    assert.isDefined(question);
    if (!question) return;

    assert.include(
      question.promptHtml,
      '<pl-figure file-name="objectbank-diagram.png" directory="clientFilesQuestion"></pl-figure>',
    );
    assert.isTrue(question.assets.has('objectbank-diagram.png'));
    assert.equal(question.assets.get('objectbank-diagram.png')?.type, 'base64');
  });

  it('ports the answer-classifier heuristics used by the transpiler', () => {
    const yesNo = classifyObjectBankAnswer('yes');
    assert.equal(yesNo.kind, 'multiple-choice');
    assert.deepEqual(yesNo.choiceOptions, ['Yes', 'No']);

    const letterChoice = classifyObjectBankAnswer('(C)');
    assert.equal(letterChoice.kind, 'multiple-choice');
    assert.deepEqual(letterChoice.choiceOptions, ['A', 'B', 'C', 'D', 'E']);

    assert.equal(convertSymbolicLatexCommands('\\frac{x+1}{y}'), '(x+1)/(y)');
    assert.deepEqual(extractSymbolicVariables('\\frac{x+1}{y}'), ['x', 'y']);
  });
});
