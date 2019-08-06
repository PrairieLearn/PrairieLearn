// @ts-check
const { assert } = require('chai');
const tmp = require('tmp-promise');
const fs = require('fs-extra');

const courseDb = require('../../sync/course-db');

/**
 * 
 * @param {any} contents 
 * @param {(filename: string) => Promise<void>} callback 
 */
async function withTempFile(contents, callback) {
  if (typeof contents !== 'string') {
    contents = JSON.stringify(contents);
  }
  const file = await tmp.file();
  await fs.writeFile(file.path, contents);
  try {
    await callback(file.path);
  } finally {
    await file.cleanup();
  }
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

describe('course database', () => {
  describe('course info loading', () => {
    it('loads a working course successfully', async () => {
      await withTempFile(getCourse(), async (filepath) => {
        const result = await courseDb.loadCourseInfoNew(filepath);
        assert.isNotOk(result.error);
        assert.isNotOk(result.warning);
        assert.isOk(result.data);
      });
    });

    it('warns about a default assessment set being present', async () => {
      const course = getCourse();
      course.assessmentSets.push({
        name: 'Homework',
        abbreviation: 'HW',
        heading: 'Homeworks',
        color: 'red1',
      });
      await withTempFile(course, async (filepath) => {
        const result = await courseDb.loadCourseInfoNew(filepath);
        assert.isNotOk(result.error);
        assert.include(result.warning, 'Default assessmentSet "Homework" should not be included in infoCourse.json');
        assert.isOk(result.data);
      })
    });
  });
});
