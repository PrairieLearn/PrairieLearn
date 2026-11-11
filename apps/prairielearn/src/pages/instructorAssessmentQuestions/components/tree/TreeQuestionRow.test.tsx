import * as cheerio from 'cheerio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { EnumAssessmentType } from '../../../../lib/db-types.js';
import type { QuestionPointsJson } from '../../../../schemas/infoAssessment.js';
import type { AltPoolBlockForm, QuestionAlternativeForm, TrackingId } from '../../types.js';

import { PointsBadge } from './TreeQuestionRow.js';

function renderBadge({
  question,
  parent = {},
  assessmentType = 'Homework',
}: {
  question: QuestionPointsJson & { forceMaxPoints?: boolean };
  parent?: QuestionPointsJson & { forceMaxPoints?: boolean };
  assessmentType?: EnumAssessmentType;
}) {
  const alternative: QuestionAlternativeForm = {
    trackingId: 'question' as TrackingId,
    id: '@shared/unavailable',
    ...question,
  };
  const pool: AltPoolBlockForm = {
    trackingId: 'pool' as TrackingId,
    alternatives: [alternative],
    ...parent,
  };
  return cheerio.load(
    renderToStaticMarkup(
      <PointsBadge
        question={alternative}
        zoneQuestionBlock={pool}
        assessmentType={assessmentType}
      />,
    ),
  );
}

describe('PointsBadge', () => {
  it.each([
    {
      name: 'own Homework points and cap',
      question: { points: 5, maxPoints: 10 },
      expected: '5/10 pts',
    },
    {
      name: 'an overridden value with an inherited cap',
      question: { points: 4 },
      parent: { points: 6, maxPoints: 12 },
      expected: '4/12 pts',
    },
    {
      name: 'a cap without initial points',
      question: { maxPoints: 10 },
      expected: '10 pts max',
    },
    {
      name: 'an Exam point sequence',
      question: { points: [10, 10, 10, 5] },
      assessmentType: 'Exam' as const,
      expected: '10×3, 5 pts',
    },
    {
      name: 'explicit zero points',
      question: { points: 0 },
      parent: { points: 10 },
      expected: '0 pts',
    },
  ])('shows a neutral score for $name', (scenario) => {
    const $ = renderBadge(scenario);

    expect($.root().text()).toBe(scenario.expected);
    expect($('i')).toHaveLength(0);
  });

  it('shows the inherited maximum with a pin when force max points is enabled', () => {
    const $ = renderBadge({
      question: { points: 4 },
      parent: { points: 6, maxPoints: 10, forceMaxPoints: true },
    });

    expect($.root().text()).toBe('10');
    expect($('.bi-pin-angle-fill')).toHaveLength(1);
    expect($('.bi-pen-fill, .bi-lightning-charge-fill')).toHaveLength(0);
  });

  it('keeps an explicit split-point zero instead of falling back to inherited legacy points', () => {
    const $ = renderBadge({ question: { manualPoints: 0 }, parent: { points: 10 } });

    expect($.root().text()).toBe('0');
    expect($('.bi-pen-fill')).toHaveLength(1);
    expect($('.bi-lightning-charge-fill')).toHaveLength(0);
  });

  it('omits a pool header badge when the pool has no point defaults', () => {
    const pool: AltPoolBlockForm = { trackingId: 'pool' as TrackingId, alternatives: [] };

    expect(
      renderToStaticMarkup(
        <PointsBadge question={pool} zoneQuestionBlock={pool} assessmentType="Homework" />,
      ),
    ).toBe('');
  });
});
