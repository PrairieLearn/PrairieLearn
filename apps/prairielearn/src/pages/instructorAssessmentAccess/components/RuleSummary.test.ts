import { describe, expect, it } from 'vitest';

import { generateAfterCompleteTableRows, generateDefaultRuleDateTableRows } from './RuleSummary.js';
import type { DefaultRuleData } from './types.js';

const TEST_TIMEZONE = 'America/Chicago';

function makeDefaultRule(partial: Partial<DefaultRuleData> = {}): DefaultRuleData {
  return {
    trackingId: 'default',
    beforeReleaseListed: false,
    dateControlEnabled: true,
    release: { date: '2026-04-10T00:00:01', released: true },
    due: { date: '2026-05-01T23:59:59', credit: null, customCredit: false },
    earlyDeadlines: [],
    lateDeadlines: [],
    afterLastDeadline: null,
    durationMinutes: null,
    password: null,
    prairieTestExams: [],
    questionVisibility: { hidden: true },
    scoreVisibility: { hidden: false },
    ...partial,
  };
}

describe('generateAfterCompleteTableRows', () => {
  it('orders question and score visibility changes by date', () => {
    const rows = generateAfterCompleteTableRows(
      makeDefaultRule({
        questionVisibility: {
          hidden: true,
          visibleFromDate: '2026-05-29T10:00:00',
          visibleUntilDate: '2026-06-01T18:30:00',
        },
        scoreVisibility: { hidden: true, visibleFromDate: '2026-05-28T20:15:00' },
      }),
      TEST_TIMEZONE,
    );

    expect(
      rows.map(({ key, questionsVisible, scoreVisible }) => ({
        key,
        questionsVisible,
        scoreVisible,
      })),
    ).toEqual([
      { key: 'immediately', questionsVisible: false, scoreVisible: false },
      { key: 'after-2026-05-28T20:15:00', questionsVisible: false, scoreVisible: true },
      { key: 'after-2026-05-29T10:00:00', questionsVisible: true, scoreVisible: true },
      { key: 'after-2026-06-01T18:30:00', questionsVisible: false, scoreVisible: true },
    ]);
  });

  it('merges question and score visibility changes on the same date', () => {
    const rows = generateAfterCompleteTableRows(
      makeDefaultRule({
        questionVisibility: {
          hidden: true,
          visibleFromDate: '2026-05-29T10:00:00',
        },
        scoreVisibility: { hidden: true, visibleFromDate: '2026-05-29T10:00:00' },
      }),
      TEST_TIMEZONE,
    );

    expect(
      rows.map(({ key, questionsVisible, scoreVisible }) => ({
        key,
        questionsVisible,
        scoreVisible,
      })),
    ).toEqual([
      { key: 'immediately', questionsVisible: false, scoreVisible: false },
      { key: 'after-2026-05-29T10:00:00', questionsVisible: true, scoreVisible: true },
    ]);
  });

  it('omits the table when after-completion settings are not active', () => {
    expect(
      generateAfterCompleteTableRows(
        makeDefaultRule({
          dateControlEnabled: false,
          due: { date: null, credit: null, customCredit: false },
        }),
        TEST_TIMEZONE,
      ),
    ).toEqual([]);
  });
});

describe('generateDefaultRuleDateTableRows', () => {
  it('adds listing state as the first row', () => {
    const rows = generateDefaultRuleDateTableRows(makeDefaultRule(), TEST_TIMEZONE);

    expect(rows[0]).toMatchObject({
      label: 'Before release',
      date: '',
      access: 'Hidden from students',
    });
  });

  it('omits the date table when date control is disabled', () => {
    expect(
      generateDefaultRuleDateTableRows(
        makeDefaultRule({
          dateControlEnabled: false,
          beforeReleaseListed: true,
          due: { date: null, credit: null, customCredit: false },
        }),
        TEST_TIMEZONE,
      ),
    ).toEqual([]);
  });
});
