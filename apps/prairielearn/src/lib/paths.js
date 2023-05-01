// @ts-check
const path = require('node:path');

const REPOSITORY_ROOT_PATH = path.resolve(__dirname, '..', '..', '..', '..');

const APP_ROOT_PATH = path.resolve(__dirname, '..', '..');

const EXAMPLE_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'exampleCourse');

const TEST_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'testCourse');

module.exports = {
  REPOSITORY_ROOT_PATH,
  APP_ROOT_PATH,
  EXAMPLE_COURSE_PATH,
  TEST_COURSE_PATH,
};
