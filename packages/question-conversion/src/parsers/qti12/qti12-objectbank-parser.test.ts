import { readFileSync } from 'node:fs';
import path from 'node:path';

import { assert, describe, it } from 'vitest';

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

  it('classifies direct-answer items as auto-graded short-answer questions', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });

    const q1 = result.questions.find((question) => question.sourceId === 'q1_yes');
    assert.isDefined(q1);
    if (!q1) return;
    assert.equal(q1.body.type, 'string-input');
    assert.equal(q1.gradingMethod, 'Internal');
    assert.equal(q1.feedback?.correct, 'yes');
    assert.equal(q1.feedback?.incorrect, 'yes');
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

  it('warns and falls back to manual grading for ambiguous symbolic answers', async () => {
    const result = await parser.parse(readFixture('objectbank-sample.xml'), {
      basePath: FIXTURES,
    });

    const question = result.questions.find((q) => q.sourceId === 'q4_symbolic');
    assert.isDefined(question);
    if (!question) return;
    assert.equal(question.body.type, 'rich-text');
    assert.equal(question.gradingMethod, 'Manual');
    assert.isTrue(
      result.parseWarnings?.some(
        (warning) =>
          warning.questionId === 'q4_symbolic' && warning.message.includes('non-plain answer key'),
      ) ?? false,
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
});
