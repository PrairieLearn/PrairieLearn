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

  describe('afterComplete hideQuestions union', () => {
    it('accepts hideQuestions: true with date fields', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideQuestions: true,
          showQuestionsAgainDate: '2024-03-25T00:00:00',
          hideQuestionsAgainDate: '2024-03-30T00:00:00',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hideQuestions: true without date fields', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { hideQuestions: true },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hideQuestions: false without date fields', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { hideQuestions: false },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hideQuestions: false with null date fields (override clearing)', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideQuestions: false,
          showQuestionsAgainDate: null,
          hideQuestionsAgainDate: null,
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects hideQuestions: false with non-null showQuestionsAgainDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideQuestions: false,
          showQuestionsAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects hideQuestions: false with non-null hideQuestionsAgainDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideQuestions: false,
          hideQuestionsAgainDate: '2024-03-30T00:00:00',
        },
      });
      expect(result.success).toBe(false);
    });

    it('allows date fields when hideQuestions is absent (override inheriting boolean)', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          showQuestionsAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('afterComplete hideScore union', () => {
    it('accepts hideScore: true with showScoreAgainDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideScore: true,
          showScoreAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hideScore: true without showScoreAgainDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { hideScore: true },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hideScore: false without showScoreAgainDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: { hideScore: false },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hideScore: false with null showScoreAgainDate (override clearing)', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideScore: false,
          showScoreAgainDate: null,
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects hideScore: false with non-null showScoreAgainDate', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideScore: false,
          showScoreAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(false);
    });

    it('allows showScoreAgainDate when hideScore is absent (override inheriting boolean)', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          showScoreAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('afterComplete combined groups', () => {
    it('accepts both groups with hideQuestions: true and hideScore: true', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideQuestions: true,
          showQuestionsAgainDate: '2024-03-25T00:00:00',
          hideScore: true,
          showScoreAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts hideQuestions: false with hideScore: true and date', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideQuestions: false,
          hideScore: true,
          showScoreAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects hideQuestions: false with date even when hideScore is valid', () => {
      const result = AccessControlJsonSchema.safeParse({
        afterComplete: {
          hideQuestions: false,
          showQuestionsAgainDate: '2024-03-25T00:00:00',
          hideScore: true,
          showScoreAgainDate: '2024-03-25T00:00:00',
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
