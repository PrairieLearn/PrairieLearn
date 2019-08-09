// @ts-check
const { assert } = require('chai');
const tmp = require('tmp-promise');
const fs = require('fs-extra');
const path = require('path');

const courseDb = require('../../sync/course-db');
const infofile = require('../../sync/infofile');

/**
 * @param {(dir: string) => Promise<void>} callback 
 */
async function withTempDirectory(callback) {
  const dir = await tmp.dir({ unsafeCleanup: true });
  try {
    await callback(dir.path);
  } finally {
    await dir.cleanup();
  }
}

/**
 * @param {string} courseDir 
 * @param {object} course 
 */
async function writeCourse(courseDir, course) {
  await fs.writeJSON(path.join(courseDir, 'infoCourse.json'), course);
}

/**
 * 
 * @param {string} courseDir 
 * @param {string} qid 
 * @param {object} question 
 */
async function writeQuestion(courseDir, qid, question) {
  await fs.mkdirs(path.join(courseDir, 'questions', qid));
  await fs.writeJSON(path.join(courseDir, 'questions', qid, 'info.json'), question);
}

function getCourse() {
  return {
    uuid: '5d14d80e-b0b8-494e-afed-f5a47497f5cb',
    name: 'TEST 101',
    title: 'Test Course',
    topics: [],
    tags: [],
    assessmentSets: [],
  };
}

function getQuestion() {
  return {
    uuid: 'f4ff2429-926e-4358-9e1f-d2f377e2036a',
    title: 'Test question',
    topic: 'Test',
    secondaryTopics: [],
    tags: ['test'],
    type: 'v3',
  };
}

function getAlternativeQuestion() {
  return {
    uuid: '697a6188-8215-4806-92a1-592987342b9e',
    title: 'Another test question',
    topic: 'Test',
    secondaryTopics: [],
    tags: ['test'],
    type: 'Calculation',
  };
}

describe('course database', () => {
  describe('course info loading', () => {
    it('loads a working course successfully', async () => {
      await withTempDirectory(async (dir) => {
        await writeCourse(dir, getCourse());
        const result = await courseDb.loadCourseInfo(dir);
        assert.isFalse(infofile.hasErrors(result));
        assert.isFalse(infofile.hasWarnings(result));
        assert.isOk(result.data);
      });
    });

    it('warns about a default assessment set being present', async () => {
      await withTempDirectory(async (dir) => {
        const course = getCourse();
        course.assessmentSets.push({
          name: 'Homework',
          abbreviation: 'HW',
          heading: 'Homeworks',
          color: 'red1',
        });
        await writeCourse(dir, course);
        const result = await courseDb.loadCourseInfo(dir);
        assert.isFalse(infofile.hasErrors(result));
        assert.isTrue(infofile.hasWarnings(result));
        assert.include(result.warnings, 'Default assessmentSet "Homework" should not be included in infoCourse.json');
        assert.isOk(result.data);
      });
    });
  });

  describe('questions loading', () => {
    it('loads some questions successfully', async () => {
      await withTempDirectory(async (dir) => {
        const question1 = getQuestion();
        const question2 = getAlternativeQuestion();
        await writeQuestion(dir, 'question1', getQuestion());
        await writeQuestion(dir, 'question2', getAlternativeQuestion());
        const result = await courseDb.loadQuestions(dir);
        assert.equal(Object.keys(result).length, 2);
        assert.isFalse(infofile.hasErrors(result['question1']));
        assert.isFalse(infofile.hasWarnings(result['question1']));
        assert.isFalse(infofile.hasErrors(result['question2']));
        assert.isFalse(infofile.hasWarnings(result['question2']));
        assert.equal(result['question1'].data.uuid, question1.uuid);
        assert.equal(result['question2'].data.uuid, question2.uuid);
      });
    });

    it('errors if two questions share a UUID', async () => {
      await withTempDirectory(async (dir) => {
        await writeQuestion(dir, 'question1', getQuestion());
        await writeQuestion(dir, 'question2', getQuestion());
        await writeQuestion(dir, 'question3', getAlternativeQuestion());
        const result = await courseDb.loadQuestions(dir);
        assert.isFalse(infofile.hasErrors(result));
        assert.isFalse(infofile.hasWarnings(result));
        assert.equal(Object.keys(result).length, 3);
        assert.match(infofile.stringifyErrors(result['question1']), /UUID.*is used in other questions/);
        assert.isFalse(infofile.hasWarnings(result['question1']));
        assert.match(infofile.stringifyErrors(result['question2']), /UUID.*is used in other questions/);
        assert.isFalse(infofile.hasWarnings(result['question2']));
        assert.isFalse(infofile.hasErrors(result['question3']));
        assert.isFalse(infofile.hasWarnings(result['question3']));
      });
    });
  });
});
