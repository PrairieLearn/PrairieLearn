// @ts-check
const assert = require('chai').assert;

const chunksLib = require('../lib/chunks');

const COURSE = {
    questions: {
        'simple-question': {},
        'complex/question': {},
    },
    courseInstances: {
        'simple-course-instance': {
            assessments: {
                'simple-assessment': {},
                'complex/assessment': {},
            },
        },
        'complex/course/instance': {
            assessments: {
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
            assert.isOk(chunks.elements);
        });

        it('should identify change in clientFilesCourse', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['clientFilesCourse/path/to/file.js'],
                COURSE,
            );
            assert.isOk(chunks.clientFilesCourse);
        });

        it('should identify change in serverFilesCourse', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['serverFilesCourse/path/to/file.js'],
                COURSE,
            );
            assert.isOk(chunks.serverFilesCourse);
        });

        it('should identify simple question', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['questions/simple-question/tests/test.py'],
                COURSE,
            );
            assert.isOk(chunks.questions.has('simple-question'));
        });

        it('should identify complex question', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['questions/complex/question/tests/test.py'],
                COURSE,
            );
            assert.isOk(chunks.questions.has('complex/question'));
        });

        it('should identify simple assessment in simple course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/simple-course-instance/assessments/simple-assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['simple-course-instance'].assessments.has('simple-assessment'));
        });

        it('should identify complex assessment in simple course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/simple-course-instance/assessments/complex/assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['simple-course-instance'].assessments.has('complex/assessment'));
        });

        it('should identify simple assessment in complex course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/complex/course/instance/assessments/simple-assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['complex/course/instance'].assessments.has('simple-assessment'));
        });

        it('should identify complex assessment in simple course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/complex/course/instance/assessments/complex/assessment/clientFilesAssessment/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['complex/course/instance'].assessments.has('complex/assessment'));
        });

        it('should identify clientFilesCourseInstance in simple course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/simple-course-instance/clientFilesCourseInstance/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['simple-course-instance'].clientFilesCourseInstance);
        });

        it('should identify clientFilesCourseInstance in complex course instance', () => {
            const chunks = chunksLib.identifyChunksFromChangedFiles(
                ['courseInstances/complex/course/instance/clientFilesCourseInstance/file.txt'],
                COURSE,
            );
            assert.isOk(chunks.courseInstances['complex/course/instance'].clientFilesCourseInstance);
        });
    });
});
