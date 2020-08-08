const assert = require('chai').assert;

const chunksLib = require('../lib/chunks');

const COURSE = {
    questionDB: {
        'simple-question': {},
        'complex/question': {}
    },
    courseInstanceDB: {
        'simple-course-instance': {
            assessmentDB: {
                'simple-assessment': {},
                'complex/assessment': {},
            }
        },
        'complex/course/instance': {
            assessmentDB: {
                'simple-assessment': {},
                'complex/assessment': {},
            }
        }
    }
}

describe('chunks', () => {
    describe('identifyChunksFromChangedFiles', () => {
        it('should identify simple question', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['questions/simple-question/tests/test.py'],
                COURSE
            );
            assert.isOk(chunks.questionChunks.has('simple-question'));
        })
    })
});
