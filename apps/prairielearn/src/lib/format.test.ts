import { assert } from 'chai';

import { formatFloat, formatPoints, formatPointsOrList } from './format.js';

describe('format library', () => {
  it('formatFloat', () => {
    assert.equal(formatFloat(1), '1.00');
    assert.equal(formatFloat(1.2), '1.20');
    assert.equal(formatFloat(1.23), '1.23');
    assert.equal(formatFloat(1.234), '1.23');
    assert.equal(formatFloat(1.2345), '1.23');
    assert.equal(formatFloat(1.2367), '1.24');
    assert.equal(formatFloat(0), '0.00');
    assert.equal(formatFloat(0.2), '0.20');
    assert.equal(formatFloat(0.23), '0.23');
    assert.equal(formatFloat(0.234), '0.23');
    assert.equal(formatFloat(0.2345), '0.23');

    assert.equal(formatFloat(1.2346, 0), '1');
    assert.equal(formatFloat(1.2346, 1), '1.2');
    assert.equal(formatFloat(1.2346, 2), '1.23');
    assert.equal(formatFloat(1.2346, 3), '1.235');

    assert.equal(formatFloat(null), '—');
  });

  it('formatPoints', () => {
    assert.equal(formatPoints(1), '1');
    assert.equal(formatPoints(1.2), '1.2');
    assert.equal(formatPoints(1.23), '1.23');
    assert.equal(formatPoints(1.234), '1.23');
    assert.equal(formatPoints(1.2345), '1.23');
    assert.equal(formatPoints(1.2367), '1.23');
    assert.equal(formatPoints(0), '0');
    assert.equal(formatPoints(0.2), '0.2');
    assert.equal(formatPoints(0.23), '0.23');
    assert.equal(formatPoints(0.234), '0.23');
    assert.equal(formatPoints(0.2345), '0.23');

    assert.equal(formatPoints(1.2345, 0), '1');
    assert.equal(formatPoints(1.2345, 1), '1.2');
    assert.equal(formatPoints(1.2345, 2), '1.23');
    assert.equal(formatPoints(1.2345, 3), '1.234');

    assert.equal(formatPoints(null), '—');
  });

  it('formatPointsOrList', () => {
    assert.equal(formatPointsOrList(1), '1');
    assert.equal(formatPointsOrList(1.2345), '1.23');

    assert.equal(formatPointsOrList(null), '—');

    assert.equal(formatPointsOrList([1, 2, 3]), '1, 2, 3');
    assert.equal(formatPointsOrList([1.2345, 2.3456, 3.4567]), '1.23, 2.34, 3.45');
    assert.equal(formatPointsOrList([1.2345, 2, 3.4]), '1.23, 2, 3.4');
  });
});
