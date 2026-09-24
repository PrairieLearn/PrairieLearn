import { describe, expect, it } from 'vitest';

import { getAssessmentInstanceTimeFields } from './assessment-instances.js';

const now = new Date('2030-01-01T00:00:00.000Z');

describe('getAssessmentInstanceTimeFields', () => {
  it('formats remaining time and total time for an open instance', () => {
    expect(
      getAssessmentInstanceTimeFields(
        {
          open: true,
          date: new Date('2029-12-31T23:00:00.000Z'),
          date_limit: new Date('2030-01-01T00:02:00.000Z'),
          grading_needed: false,
        },
        now,
      ),
    ).toEqual({
      time_remaining: '2 min',
      time_remaining_sec: 120,
      total_time: '62 min',
      total_time_sec: 3720,
    });
  });

  it('shows less than one minute before the deadline', () => {
    expect(
      getAssessmentInstanceTimeFields(
        {
          open: true,
          date: new Date('2029-12-31T23:59:00.000Z'),
          date_limit: new Date('2030-01-01T00:00:59.000Z'),
          grading_needed: false,
        },
        now,
      ).time_remaining,
    ).toBe('< 1 min');
  });

  it('marks an elapsed deadline as expired', () => {
    expect(
      getAssessmentInstanceTimeFields(
        {
          open: true,
          date: new Date('2029-12-31T23:00:00.000Z'),
          date_limit: now,
          grading_needed: false,
        },
        now,
      ),
    ).toMatchObject({
      time_remaining: 'Expired',
      time_remaining_sec: 0,
    });
  });

  it('describes open instances without a time limit', () => {
    expect(
      getAssessmentInstanceTimeFields(
        { open: true, date: now, date_limit: null, grading_needed: false },
        now,
      ),
    ).toEqual({
      time_remaining: 'Open (no time limit)',
      time_remaining_sec: null,
      total_time: 'Open (no time limit)',
      total_time_sec: null,
    });
  });

  it('distinguishes closed instances with pending grading', () => {
    expect(
      getAssessmentInstanceTimeFields(
        { open: false, date: now, date_limit: null, grading_needed: true },
        now,
      ),
    ).toMatchObject({
      time_remaining: 'Closed (pending grading)',
      total_time: 'Closed',
    });
  });

  it('shows closed when open is null even with pending grading', () => {
    expect(
      getAssessmentInstanceTimeFields(
        { open: null, date: now, date_limit: null, grading_needed: true },
        now,
      ).time_remaining,
    ).toBe('Closed');
  });
});
