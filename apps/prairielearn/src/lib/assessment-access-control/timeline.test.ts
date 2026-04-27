import { describe, expect, it } from 'vitest';

import { type RuntimeDateControl, buildAccessTimeline } from './timeline.js';

describe('buildAccessTimeline', () => {
  it('returns empty for no dateControl', () => {
    expect(buildAccessTimeline(undefined, new Date())).toEqual([]);
  });

  it('returns empty for no release', () => {
    expect(buildAccessTimeline({}, new Date())).toEqual([]);
  });

  it('returns empty when dueDate <= release date', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-15T00:00:00Z') },
      due: { date: new Date('2025-03-14T00:00:00Z') },
    };
    expect(buildAccessTimeline(dc, new Date('2025-03-15T12:00:00Z'))).toEqual([]);
  });

  it('builds credit segment plus after-last-deadline for release + dueDate', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-01T00:00:00Z') },
      due: { date: new Date('2025-03-15T00:00:00Z') },
    };
    const now = new Date('2025-03-10T00:00:00Z');
    const timeline = buildAccessTimeline(dc, now);

    expect(timeline).toEqual([
      {
        credit: 100,
        startDate: new Date('2025-03-01T00:00:00Z'),
        endDate: new Date('2025-03-15T00:00:00Z'),
        current: true,
        submittable: true,
      },
      {
        credit: 0,
        startDate: new Date('2025-03-15T00:00:00Z'),
        endDate: null,
        current: false,
        submittable: false,
      },
    ]);
  });

  it('builds full timeline with early, due, late, and afterLastDeadline', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-01T00:00:00Z') },
      due: { date: new Date('2025-03-15T00:00:00Z') },
      earlyDeadlines: [{ date: '2025-03-08T00:00:00Z', credit: 120 }],
      lateDeadlines: [{ date: '2025-03-22T00:00:00Z', credit: 50 }],
      afterLastDeadline: { credit: 0 },
    };
    const now = new Date('2025-03-10T00:00:00Z');
    const timeline = buildAccessTimeline(dc, now);

    expect(timeline).toHaveLength(4);
    expect(timeline[0]).toEqual({
      credit: 120,
      startDate: new Date('2025-03-01T00:00:00Z'),
      endDate: new Date('2025-03-08T00:00:00Z'),
      current: false,
      submittable: true,
    });
    expect(timeline[1]).toEqual({
      credit: 100,
      startDate: new Date('2025-03-08T00:00:00Z'),
      endDate: new Date('2025-03-15T00:00:00Z'),
      current: true,
      submittable: true,
    });
    expect(timeline[2]).toEqual({
      credit: 50,
      startDate: new Date('2025-03-15T00:00:00Z'),
      endDate: new Date('2025-03-22T00:00:00Z'),
      current: false,
      submittable: true,
    });
    expect(timeline[3]).toEqual({
      credit: 0,
      startDate: new Date('2025-03-22T00:00:00Z'),
      endDate: null,
      current: false,
      submittable: false,
    });
  });

  it('marks afterLastDeadline submittable when allowSubmissions is true', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-01T00:00:00Z') },
      due: { date: new Date('2025-03-15T00:00:00Z') },
      afterLastDeadline: { credit: 50, allowSubmissions: true },
    };
    const timeline = buildAccessTimeline(dc, new Date('2025-03-20T00:00:00Z'));

    expect(timeline[1].submittable).toBe(true);
  });

  it('includes afterLastDeadline segment with non-zero credit', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-01T00:00:00Z') },
      due: { date: new Date('2025-03-15T00:00:00Z') },
      afterLastDeadline: { credit: 25 },
    };
    const now = new Date('2025-03-20T00:00:00Z');
    const timeline = buildAccessTimeline(dc, now);

    expect(timeline).toHaveLength(2);
    expect(timeline[1]).toEqual({
      credit: 25,
      startDate: new Date('2025-03-15T00:00:00Z'),
      endDate: null,
      current: true,
      submittable: false,
    });
  });

  it('prepends before-release entry when date is before release date', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-15T00:00:00Z') },
      due: { date: new Date('2025-04-01T00:00:00Z') },
    };
    const now = new Date('2025-03-10T00:00:00Z');
    const timeline = buildAccessTimeline(dc, now);

    expect(timeline).toHaveLength(3);
    expect(timeline[0]).toEqual({
      credit: 0,
      startDate: null,
      endDate: new Date('2025-03-15T00:00:00Z'),
      current: true,
      submittable: false,
    });
    expect(timeline[1].credit).toBe(100);
    expect(timeline[1].current).toBe(false);
    expect(timeline[2].credit).toBe(0);
    expect(timeline[2].endDate).toBeNull();
  });

  it('does not include before-release entry when date is after release date', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-01T00:00:00Z') },
      due: { date: new Date('2025-04-01T00:00:00Z') },
    };
    const now = new Date('2025-03-10T00:00:00Z');
    const timeline = buildAccessTimeline(dc, now);

    expect(timeline[0].startDate).toEqual(new Date('2025-03-01T00:00:00Z'));
    expect(timeline[0].credit).toBe(100);
  });

  it('always includes after-last-deadline entry even without afterLastDeadline config', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-01T00:00:00Z') },
      due: { date: new Date('2025-03-15T00:00:00Z') },
    };
    const now = new Date('2025-03-20T00:00:00Z');
    const timeline = buildAccessTimeline(dc, now);

    const lastEntry = timeline[timeline.length - 1];
    expect(lastEntry).toEqual({
      credit: 0,
      startDate: new Date('2025-03-15T00:00:00Z'),
      endDate: null,
      current: true,
      submittable: false,
    });
  });

  describe('custom due credit', () => {
    it('uses the custom due credit before the due date', () => {
      const dc: RuntimeDateControl = {
        release: { date: new Date('2025-03-01T00:00:00Z') },
        due: { date: new Date('2025-04-01T00:00:00Z'), credit: 80 },
      };
      const timeline = buildAccessTimeline(dc, new Date('2025-03-15T00:00:00Z'));
      expect(timeline[0].credit).toBe(80);
      expect(timeline[1].credit).toBe(0);
    });

    it('caps late-deadline credit at the custom due credit', () => {
      const dc: RuntimeDateControl = {
        release: { date: new Date('2025-03-01T00:00:00Z') },
        due: { date: new Date('2025-04-01T00:00:00Z'), credit: 80 },
        lateDeadlines: [
          { date: '2025-04-15T00:00:00Z', credit: 90 },
          { date: '2025-04-30T00:00:00Z', credit: 70 },
        ],
      };
      const timeline = buildAccessTimeline(dc, new Date('2025-04-10T00:00:00Z'));
      expect(timeline.map((s) => s.credit)).toEqual([80, 80, 70, 0]);
    });

    it('floors early-deadline credit at the custom due credit when above 100', () => {
      const dc: RuntimeDateControl = {
        release: { date: new Date('2025-01-01T00:00:00Z') },
        due: { date: new Date('2025-04-01T00:00:00Z'), credit: 120 },
        earlyDeadlines: [
          { date: '2025-02-01T00:00:00Z', credit: 130 },
          { date: '2025-03-01T00:00:00Z', credit: 110 },
        ],
      };
      const timeline = buildAccessTimeline(dc, new Date('2025-02-15T00:00:00Z'));
      expect(timeline.map((s) => s.credit)).toEqual([130, 120, 120, 0]);
    });

    it('applies indefinite due credit when due date is null and no other deadlines exist', () => {
      const dc: RuntimeDateControl = {
        release: { date: new Date('2025-03-01T00:00:00Z') },
        due: { date: null, credit: 50 },
      };
      const timeline = buildAccessTimeline(dc, new Date('2030-01-01T00:00:00Z'));
      expect(timeline).toEqual([
        {
          credit: 50,
          startDate: new Date('2025-03-01T00:00:00Z'),
          endDate: null,
          current: true,
          submittable: true,
        },
      ]);
    });

    it('applies indefinite default credit when due is configured with null date and no credit', () => {
      const dc: RuntimeDateControl = {
        release: { date: new Date('2025-03-01T00:00:00Z') },
        due: { date: null },
      };
      const timeline = buildAccessTimeline(dc, new Date('2030-01-01T00:00:00Z'));
      expect(timeline).toEqual([
        {
          credit: 100,
          startDate: new Date('2025-03-01T00:00:00Z'),
          endDate: null,
          current: true,
          submittable: true,
        },
      ]);
    });

    it('applies indefinite due credit after early deadlines, shadowing afterLastDeadline', () => {
      const dc: RuntimeDateControl = {
        release: { date: new Date('2025-01-01T00:00:00Z') },
        due: { date: null, credit: 80 },
        earlyDeadlines: [{ date: '2025-02-01T00:00:00Z', credit: 120 }],
        afterLastDeadline: { credit: 50, allowSubmissions: true },
      };
      const timeline = buildAccessTimeline(dc, new Date('2030-01-01T00:00:00Z'));
      expect(timeline).toHaveLength(2);
      expect(timeline[0]).toEqual({
        credit: 120,
        startDate: new Date('2025-01-01T00:00:00Z'),
        endDate: new Date('2025-02-01T00:00:00Z'),
        current: false,
        submittable: true,
      });
      expect(timeline[1]).toEqual({
        credit: 80,
        startDate: new Date('2025-02-01T00:00:00Z'),
        endDate: null,
        current: true,
        submittable: true,
      });
    });
  });

  it('includes both before-release and after-last-deadline in full timeline', () => {
    const dc: RuntimeDateControl = {
      release: { date: new Date('2025-03-15T00:00:00Z') },
      due: { date: new Date('2025-04-01T00:00:00Z') },
      lateDeadlines: [{ date: '2025-04-08T00:00:00Z', credit: 50 }],
      afterLastDeadline: { credit: 10 },
    };
    const now = new Date('2025-03-10T00:00:00Z');
    const timeline = buildAccessTimeline(dc, now);

    expect(timeline).toHaveLength(4);
    expect(timeline[0]).toEqual({
      credit: 0,
      startDate: null,
      endDate: new Date('2025-03-15T00:00:00Z'),
      current: true,
      submittable: false,
    });
    expect(timeline[1].credit).toBe(100);
    expect(timeline[2].credit).toBe(50);
    expect(timeline[3]).toEqual({
      credit: 10,
      startDate: new Date('2025-04-08T00:00:00Z'),
      endDate: null,
      current: false,
      submittable: false,
    });
  });
});
