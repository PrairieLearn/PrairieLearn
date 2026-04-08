import { describe, expect, it } from 'vitest';

import { buildLegacyAccessDisplayModel, buildModernAccessDisplayModel } from './access-display.js';

describe('access display adapters', () => {
  it('builds legacy rows from access-rule windows', () => {
    const model = buildLegacyAccessDisplayModel({
      accessRules: [
        {
          active: false,
          credit: '100%',
          end_date: '2025-03-10 12:00:00',
          mode: null,
          start_date: '2025-03-01 12:00:00',
          time_limit_min: '60',
        },
        {
          active: true,
          credit: '80%',
          end_date: '2025-03-20 12:00:00',
          mode: null,
          start_date: '2025-03-10 12:00:00',
          time_limit_min: '60',
        },
      ],
      active: true,
      nextActiveTime: null,
      listed: true,
    });

    expect(model.availability.state).toBe('open');
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0].dateText).toBe('2025-03-01 12:00:00 to 2025-03-10 12:00:00');
    expect(model.badges.map((badge) => badge.label)).toContain('60 minutes time limit');
  });

  it('builds modern release, due, and late timeline rows', () => {
    const model = buildModernAccessDisplayModel({
      listBeforeRelease: true,
      dateControl: {
        releaseDate: new Date('2025-03-01T18:00:00Z'),
        dueDate: new Date('2025-03-10T18:00:00Z'),
        durationMinutes: 45,
        password: 'secret',
      },
      afterComplete: {
        hideQuestions: false,
      },
      timeline: [
        { type: 'due', date: new Date('2025-03-10T18:00:00Z'), credit: 100, index: 0 },
        { type: 'late', date: new Date('2025-03-15T18:00:00Z'), credit: 80, index: 0 },
      ],
      availabilityState: 'open',
      availabilityListed: true,
      opensAt: null,
      displayTimezone: 'America/Chicago',
      prairieTestExamCount: 0,
    });

    expect(model.rows.map((row) => row.label)).toEqual(['Release', 'Due', 'Late 1', null]);
    expect(model.rows[0].detailsText).toContain('Listed before release');
    expect(model.badges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining([
        'Open now',
        '45 minutes time limit',
        'Password protected',
        'Questions visible after completion',
      ]),
    );
  });

  it('formats future-open availability with a concrete opening time', () => {
    const model = buildModernAccessDisplayModel({
      listBeforeRelease: true,
      dateControl: {
        releaseDate: new Date('2025-04-01T00:00:00Z'),
        dueDate: new Date('2025-05-01T00:00:00Z'),
      },
      timeline: [],
      availabilityState: 'future_open',
      availabilityListed: true,
      opensAt: new Date('2025-04-01T00:00:00Z'),
      displayTimezone: 'UTC',
      prairieTestExamCount: 0,
    });

    expect(model.availability.label).toBe('Not yet open');
    expect(model.availability.message).toContain('2025-04-01 00:00:00');
  });

  it('formats listed-before-release without inventing an opening date', () => {
    const model = buildModernAccessDisplayModel({
      listBeforeRelease: true,
      dateControl: {
        releaseDate: null,
      },
      timeline: [],
      availabilityState: 'before_release',
      availabilityListed: true,
      opensAt: null,
      displayTimezone: 'UTC',
      prairieTestExamCount: 0,
    });

    expect(model.availability.message).toBe('Assessment is not yet available.');
    expect(model.rows[0].dateText).toBe('Not yet available');
  });

  it('includes after-last-deadline visibility details', () => {
    const model = buildModernAccessDisplayModel({
      dateControl: {
        releaseDate: new Date('2025-03-01T00:00:00Z'),
        dueDate: new Date('2025-03-10T00:00:00Z'),
        afterLastDeadline: {
          credit: 25,
          allowSubmissions: false,
        },
      },
      afterComplete: {
        hideQuestions: true,
        hideScore: true,
      },
      timeline: [{ type: 'due', date: new Date('2025-03-10T00:00:00Z'), credit: 100, index: 0 }],
      availabilityState: 'closed',
      availabilityListed: true,
      opensAt: null,
      displayTimezone: 'UTC',
      prairieTestExamCount: 0,
    });

    expect(model.rows.at(-1)?.dateText).toBe('After last deadline');
    expect(model.rows.at(-1)?.detailsText).toBe('Closed, Questions hidden, Score hidden');
  });

  it('includes PrairieTest badges and availability messaging', () => {
    const model = buildModernAccessDisplayModel({
      timeline: [],
      availabilityState: 'prairietest_gated_unavailable',
      availabilityListed: true,
      opensAt: null,
      displayTimezone: 'UTC',
      prairieTestExamCount: 2,
    });

    expect(model.availability.message).toBe(
      'Assessment is currently only available through PrairieTest.',
    );
    expect(model.badges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(['PrairieTest required', '2 PrairieTest exams']),
    );
  });
});
