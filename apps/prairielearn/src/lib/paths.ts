import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPOSITORY_ROOT_PATH = path.resolve(__dirname, '..', '..', '..', '..');

export const APP_ROOT_PATH = path.resolve(__dirname, '..', '..');

export const EXAMPLE_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'exampleCourse');

export const TEST_COURSE_PATH = path.resolve(REPOSITORY_ROOT_PATH, 'testCourse');
