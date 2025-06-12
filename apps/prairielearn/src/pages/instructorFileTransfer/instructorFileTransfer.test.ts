import { assert, describe, it } from 'vitest';

import { getContentDir } from './instructorFileTransfer.js';

describe('Test file transfer helper function', function () {
  it('should split URLs successfully', () => {
    let contentDir = getContentDir('/tmp/questions/shared-publicly', 'questions');
    assert.equal(contentDir, 'shared-publicly');

    contentDir = getContentDir('/tmp/courseInstances/Fa19', 'courseInstances');
    assert.equal(contentDir, 'Fa19');

    contentDir = getContentDir('/tmp/questions/question/in/dir', 'questions');
    assert.equal(contentDir, 'question/in/dir');
  });
});
