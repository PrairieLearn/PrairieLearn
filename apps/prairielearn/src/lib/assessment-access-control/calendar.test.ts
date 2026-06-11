import { describe, expect, it } from 'vitest';

import { dateControlToCalendarEvents } from './calendar.js';

const NOW = new Date('2026-03-15T12:00:00Z');
const RELEASE = new Date('2026-03-03T09:00:00Z');
const DUE = new Date('2026-03-20T23:59:00Z');
const LATE = new Date('2026-03-27T23:59:00Z');

describe('dateControlToCalendarEvents', () => {
  it('returns null without a date control', () => {
    expect(dateControlToCalendarEvents(null, NOW)).toBeNull();
    expect(dateControlToCalendarEvents(undefined, NOW)).toBeNull();
  });

  it('returns null without a release date', () => {
    expect(dateControlToCalendarEvents({ due: { date: DUE } }, NOW)).toBeNull();
  });

  it('returns null for a degenerate window (due on/before release)', () => {
    expect(
      dateControlToCalendarEvents({ release: { date: DUE }, due: { date: RELEASE } }, NOW),
    ).toBeNull();
  });

  it('maps release and due to a bounded window', () => {
    const result = dateControlToCalendarEvents(
      { release: { date: RELEASE }, due: { date: DUE } },
      NOW,
    );
    expect(result).toMatchObject({
      release: RELEASE,
      due: DUE,
      windowStart: RELEASE,
      windowEnd: DUE,
      lateUntil: null,
      afterLastDeadlineCredit: null,
    });
  });

  it('extends the window through late deadlines', () => {
    const result = dateControlToCalendarEvents(
      {
        release: { date: RELEASE },
        due: { date: DUE },
        lateDeadlines: [{ date: LATE.toISOString(), credit: 50 }],
      },
      NOW,
    );
    expect(result).toMatchObject({
      due: DUE,
      windowEnd: LATE,
      lateUntil: LATE,
    });
  });

  it('produces an open-ended window for an indefinite due date', () => {
    const result = dateControlToCalendarEvents(
      { release: { date: RELEASE }, due: { date: null } },
      NOW,
    );
    expect(result).toMatchObject({
      release: RELEASE,
      due: null,
      windowEnd: null,
      lateUntil: null,
    });
  });

  it('produces an open-ended window when no due date is configured', () => {
    const result = dateControlToCalendarEvents({ release: { date: RELEASE } }, NOW);
    expect(result).toMatchObject({ release: RELEASE, due: null, windowEnd: null });
  });

  it('keeps the window open-ended when an indefinite due shadows deadlines', () => {
    const result = dateControlToCalendarEvents(
      {
        release: { date: RELEASE },
        due: { date: null, credit: 80 },
        earlyDeadlines: [{ date: DUE.toISOString(), credit: 100 }],
      },
      NOW,
    );
    expect(result).toMatchObject({ due: null, windowEnd: null });
  });

  it('surfaces after-last-deadline credit without extending the window', () => {
    const result = dateControlToCalendarEvents(
      {
        release: { date: RELEASE },
        due: { date: DUE },
        afterLastDeadline: { allowSubmissions: true, credit: 30 },
      },
      NOW,
    );
    expect(result).toMatchObject({ windowEnd: DUE, afterLastDeadlineCredit: 30 });
  });

  it('reports no after-last-deadline credit when submissions close', () => {
    const result = dateControlToCalendarEvents(
      {
        release: { date: RELEASE },
        due: { date: DUE },
        afterLastDeadline: { allowSubmissions: false },
      },
      NOW,
    );
    expect(result).toMatchObject({ windowEnd: DUE, afterLastDeadlineCredit: null });
  });

  it('marks the current timeline segment for the provided date', () => {
    const result = dateControlToCalendarEvents(
      { release: { date: RELEASE }, due: { date: DUE } },
      NOW,
    );
    const current = result?.timeline.find((e) => e.current);
    expect(current).toMatchObject({ kind: 'deadline', credit: 100 });
  });
});
