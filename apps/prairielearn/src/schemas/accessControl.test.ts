import { describe, expect, it } from 'vitest';

import { AccessControlJsonSchema } from './accessControl.js';

describe('AccessControlJsonSchema', () => {
  it('accepts explicit nulls used to clear inherited override fields', () => {
    const result = AccessControlJsonSchema.parse({
      dateControl: {
        // You cannot "clear" release date on overrides, it must be set to a value.
        releaseDate: '2024-03-14T00:01:00',
        dueDate: null,
        earlyDeadlines: null,
        lateDeadlines: null,
        afterLastDeadline: { allowSubmissions: true, credit: null },
        durationMinutes: null,
        password: null,
      },
    });

    expect(result.dateControl?.releaseDate).toBe('2024-03-14T00:01:00');
    expect(result.dateControl?.afterLastDeadline).toEqual({ allowSubmissions: true, credit: null });
    expect(result.dateControl?.durationMinutes).toBeNull();
  });

  describe('afterComplete questions union', () => {
    it('accepts hidden: true with date fields', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-25T00:00:00',
            visibleUntilDate: '2024-03-30T00:00:00',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hidden: true without date fields', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { questions: { hidden: true } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hidden: false without date fields', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { questions: { hidden: false } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hidden: false with null date fields (override clearing)', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: false,
            visibleFromDate: null,
            visibleUntilDate: null,
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects hidden: false with non-null visibleFromDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: false,
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects hidden: false with non-null visibleUntilDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: false,
            visibleUntilDate: '2024-03-30T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects visibleFromDate when hidden is absent', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects visibleUntilDate without visibleFromDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: true,
            visibleUntilDate: '2024-03-30T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects visibleUntilDate without visibleFromDate when hidden is absent', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            visibleUntilDate: '2024-03-30T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts visibleUntilDate with visibleFromDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-25T00:00:00',
            visibleUntilDate: '2024-03-30T00:00:00',
          },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('afterComplete score union', () => {
    it('accepts hidden: true with visibleFromDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          score: {
            hidden: true,
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hidden: true without visibleFromDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { score: { hidden: true } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hidden: false without visibleFromDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { score: { hidden: false } },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hidden: false with null visibleFromDate (override clearing)', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          score: {
            hidden: false,
            visibleFromDate: null,
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects hidden: false with non-null visibleFromDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          score: {
            hidden: false,
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects visibleFromDate when hidden is absent', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          score: {
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('afterComplete combined groups', () => {
    it('accepts both groups with questions hidden: true and score hidden: true', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: true,
            visibleFromDate: '2024-03-25T00:00:00',
          },
          score: {
            hidden: true,
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts questions hidden: false with score hidden: true and date', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: { hidden: false },
          score: {
            hidden: true,
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects questions hidden: false with date even when score is valid', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          questions: {
            hidden: false,
            visibleFromDate: '2024-03-25T00:00:00',
          },
          score: {
            hidden: true,
            visibleFromDate: '2024-03-25T00:00:00',
          },
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
