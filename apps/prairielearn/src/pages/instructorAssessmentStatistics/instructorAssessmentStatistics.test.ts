import { describe, expect, it } from 'vitest';

import { groupAssessmentScoresByLocalDate } from './instructorAssessmentStatistics.js';

describe('groupAssessmentScoresByLocalDate', () => {
  it('groups scores by the local calendar date using server timezone data', () => {
    const result = groupAssessmentScoresByLocalDate(
      [
        { user_id: '1', date: new Date('2026-07-03T06:30:00.000Z'), score_perc: 80 },
        { user_id: '1', date: new Date('2026-07-03T06:45:00.000Z'), score_perc: 100 },
        { user_id: '2', date: new Date('2026-07-03T07:30:00.000Z'), score_perc: 70 },
      ],
      'America/Vancouver',
    );

    expect(result).toEqual([
      {
        date: new Date('2026-07-02T00:00:00.000Z'),
        number: 1,
        mean_score_perc: 90,
        histogram: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      },
      {
        date: new Date('2026-07-03T00:00:00.000Z'),
        number: 1,
        mean_score_perc: 70,
        histogram: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      },
    ]);
  });
});
