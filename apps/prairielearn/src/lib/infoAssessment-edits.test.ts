import { assert, describe, it } from 'vitest';

import type { AssessmentJsonInput, ZoneAssessmentJsonInput } from '../schemas/infoAssessment.js';

import { removeQidsFromAssessment } from './infoAssessment-edits.js';

function makeAssessment(zones: ZoneAssessmentJsonInput[]): AssessmentJsonInput {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    type: 'Homework',
    title: 'Test assessment',
    set: 'Homework',
    number: '1',
    zones,
  };
}

describe('removeQidsFromAssessment', () => {
  it('reports only the deleted qids that the assessment actually references', () => {
    const assessment = makeAssessment([
      {
        title: 'z1',
        questions: [
          { id: 'used-a', points: 5 },
          { id: 'kept', points: 5 },
        ],
      },
      {
        title: 'z2',
        questions: [{ points: 5, alternatives: [{ id: 'used-b' }, { id: 'kept-alt' }] }],
      },
    ]);

    const { matchedQids, blockers } = removeQidsFromAssessment(
      assessment,
      new Set(['used-a', 'used-b', 'not-referenced']),
    );

    assert.sameMembers(matchedQids, ['used-a', 'used-b']);
    assert.isEmpty(blockers);
  });

  it('blocks when every zone would be emptied', () => {
    const assessment = makeAssessment([{ title: 'z1', questions: [{ id: 'a', points: 5 }] }]);

    const { blockers, matchedQids } = removeQidsFromAssessment(assessment, new Set(['a']));

    assert.deepEqual(blockers, [{ code: 'NO_ZONES_REMAINING' }]);
    assert.sameMembers(matchedQids, ['a']);
  });

  it('blocks when a lockpoint zone would be promoted to first', () => {
    const assessment = makeAssessment([
      { title: 'first', questions: [{ id: 'a', points: 5 }] },
      { title: 'second', lockpoint: true, questions: [{ id: 'b', points: 5 }] },
    ]);

    const { blockers } = removeQidsFromAssessment(assessment, new Set(['a']));

    assert.deepEqual(blockers, [{ code: 'NEW_FIRST_ZONE_HAS_LOCKPOINT' }]);
  });

  it('clears all blockers once the affected qids are skipped', () => {
    const assessment = makeAssessment([
      { title: 'first', questions: [{ id: 'a', points: 5 }] },
      { title: 'second', lockpoint: true, questions: [{ id: 'b', points: 5 }] },
    ]);

    const fullDelete = new Set(['a', 'b']);
    const { blockers, matchedQids } = removeQidsFromAssessment(assessment, fullDelete);
    assert.isNotEmpty(blockers);

    const afterSkip = removeQidsFromAssessment(
      assessment,
      new Set([...fullDelete].filter((qid) => !matchedQids.includes(qid))),
    );
    assert.isEmpty(afterSkip.blockers);
  });
});
