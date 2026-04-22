import { assert, describe, it } from 'vitest';

import type { QTI12ParsedItem } from '../../types/qti12.js';

import { shortAnswerHandler } from './short-answer.js';

describe('shortAnswerHandler', () => {
  it('produces integer body when correct answer is a whole number', () => {
    const item: QTI12ParsedItem = {
      ident: 'q1',
      title: 'Short Answer',
      questionType: 'short_answer_question',
      promptHtml: '<p>What is 2+2?</p>',
      responseLids: [],
      responseStrs: [{ ident: 'response1', rcardinality: 'Single', labels: [] }],
      correctConditions: [{ responseIdent: 'response1', correctLabelIdent: '4' }],
      feedbacks: new Map(),
      metadata: {},
    };
    const result = shortAnswerHandler.transform(item);
    assert.equal(result.body.type, 'integer');
    if (result.body.type === 'integer') {
      assert.equal(result.body.answer.correctValue, 4);
    }
  });

  it('produces numeric body when correct answer is a decimal', () => {
    const item: QTI12ParsedItem = {
      ident: 'q1',
      title: 'Short Answer',
      questionType: 'short_answer_question',
      promptHtml: '<p>What is pi approximately?</p>',
      responseLids: [],
      responseStrs: [{ ident: 'response1', rcardinality: 'Single', labels: [] }],
      correctConditions: [{ responseIdent: 'response1', correctLabelIdent: '3.14' }],
      feedbacks: new Map(),
      metadata: {},
    };
    const result = shortAnswerHandler.transform(item);
    assert.equal(result.body.type, 'numeric');
    if (result.body.type === 'numeric') {
      assert.equal(result.body.answer.correctValue, 3.14);
    }
  });

  it('produces string-input body when correct answer is text', () => {
    const item: QTI12ParsedItem = {
      ident: 'q1',
      title: 'Short Answer',
      questionType: 'short_answer_question',
      promptHtml: '<p>What is the capital of France?</p>',
      responseLids: [],
      responseStrs: [{ ident: 'response1', rcardinality: 'Single', labels: [] }],
      correctConditions: [{ responseIdent: 'response1', correctLabelIdent: 'Paris' }],
      feedbacks: new Map(),
      metadata: {},
    };
    const result = shortAnswerHandler.transform(item);
    assert.equal(result.body.type, 'string-input');
    if (result.body.type === 'string-input') {
      assert.equal(result.body.correctAnswer, 'Paris');
      assert.isTrue(result.body.ignoreCase);
    }
  });

  it('falls back to general_fb when no correct condition', () => {
    const item: QTI12ParsedItem = {
      ident: 'q1',
      title: 'Short Answer',
      questionType: 'short_answer_question',
      promptHtml: '<p>Name something</p>',
      responseLids: [],
      responseStrs: [],
      correctConditions: [],
      feedbacks: new Map([['general_fb', 'expected answer']]),
      metadata: {},
    };
    const result = shortAnswerHandler.transform(item);
    assert.equal(result.body.type, 'string-input');
    if (result.body.type !== 'string-input') {
      assert.fail(`Expected matching body, got ${result.body.type}`);
    }
    assert.equal(result.body.correctAnswer, 'expected answer');
    assert.isTrue(result.body.ignoreCase);
  });
});
