// Usage: pnpm --filter @prairielearn/prairielearn exec tsx ../../scripts/audit-question-authors.mts <course directory or courses root> [...]
// Emits one JSON object per legacy entry; does not modify course files.
import fs from 'node:fs/promises';
import path from 'node:path';

import glob from 'fast-glob';
import { z } from 'zod';

import { normalizeQuestionAuthors } from '../apps/prairielearn/src/lib/question-authors.js';

const roots = process.argv.slice(2);
if (roots.length === 0) throw new Error('Provide at least one course directory or courses root.');

const CourseSchema = z.object({ name: z.string() });
const QuestionSchema = z.object({ authors: z.array(z.unknown()).optional() });
const LegacyAuthorSchema = z.object({ email: z.string().optional() });

const coursePaths = new Set<string>();
for (const root of roots) {
  const files = await glob('**/infoCourse.json', {
    cwd: path.resolve(root),
    absolute: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  });
  for (const file of files) coursePaths.add(path.dirname(file));
}

if (coursePaths.size === 0) {
  throw new Error('No courses found. Check the provided paths for infoCourse.json files.');
}

for (const coursePath of [...coursePaths].sort()) {
  const course = CourseSchema.parse(
    JSON.parse(await fs.readFile(path.join(coursePath, 'infoCourse.json'), 'utf8')),
  );
  const files = await glob('**/info.json', { cwd: path.join(coursePath, 'questions') });
  for (const file of files.sort()) {
    const question = QuestionSchema.parse(
      JSON.parse(await fs.readFile(path.join(coursePath, 'questions', file), 'utf8')),
    );
    for (const entry of question.authors ?? []) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const legacy = LegacyAuthorSchema.parse(entry);
      const { uids } = normalizeQuestionAuthors([legacy]);
      console.log(
        JSON.stringify({
          course: course.name,
          coursePath,
          question: path.dirname(file),
          entry,
          autoConvertible: uids.length > 0,
        }),
      );
    }
  }
}
