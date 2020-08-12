// @ts-check
const assert = require('chai').assert;

const chunksLib = require('../lib/chunks');

const COURSE = {
    questionDB: {
        'simple-question': {},
        'complex/question': {},
    },
    courseInstanceDB: {
        'simple-course-instance': {
            assessmentDB: {
                'simple-assessment': {},
                'complex/assessment': {},
            },
        },
        'complex/course/instance': {
            assessmentDB: {
                'simple-assessment': {},
                'complex/assessment': {},
            },
        },
    },
};

describe('chunks', () => {
    describe('identifyChunksFromChangedFiles', () => {
        it('should identify change in element', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['elements/my-special-element/impl.py'],
                COURSE,
            );
            assert.isOk(chunks.courseChunks.has('elements'));
        });

        it('should identify change in serverFilesCourse', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['serverFilesCourse/path/to/file.js'],
                COURSE,
            );
            assert.isOk(chunks.courseChunks.has('serverFilesCourse'));
        });

        it('should identify simple question', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['questions/simple-question/tests/test.py'],
                COURSE,
            );
            assert.isOk(chunks.questionChunks.has('simple-question'));
        });

        it('should identify complex question', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['questions/complex/question/tests/test.py'],
                COURSE,
            );
            assert.isOk(chunks.questionChunks.has('complex/question'));
        });

        it('should identify simple assessment in simple course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/simple-course-instance/assessments/simple-assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['simple-course-instance'].assessmentChunks.has('simple-assessment'));
        });

        it('should identify complex assessment in simple course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/simple-course-instance/assessments/complex/assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['simple-course-instance'].assessmentChunks.has('complex/assessment'));
        });

        it('should identify simple assessment in complex course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/complex/course/instance/assessments/simple-assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['complex/course/instance'].assessmentChunks.has('simple-assessment'));
        });

        it('should identify complex assessment in simple course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/complex/course/instance/assessments/complex/assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['complex/course/instance'].assessmentChunks.has('complex/assessment'));
        });
    });
});
