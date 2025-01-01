import * as path from 'node:path';

export const REPOSITORY_ROOT_PATH = path.resolve(
  ...(import.meta.dirname ? [import.meta.dirname] : [import.meta.url.replace('file:', ''), '..']),
  '..',
  '..',
  '..',
  '..',
);

export const APP_ROOT_PATH = path.resolve(
  ...(import.meta.dirname ? [import.meta.dirname] : [import.meta.url.replace('file:', ''), '..']),
  '..',
  '..',
);

export const EXAMPLE_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'exampleCourse');

export const TEST_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'testCourse');
