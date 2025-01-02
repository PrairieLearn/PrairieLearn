import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

;

export const REPOSITORY_ROOT_PATH = path.resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  '..',
  '..',
);

export const APP_ROOT_PATH = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');

export const EXAMPLE_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'exampleCourse');

export const TEST_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'testCourse');
