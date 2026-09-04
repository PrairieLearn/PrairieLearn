import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { AssessmentJsonSchema } from '../../../schemas/infoAssessment.js';
import { QuestionJsonSchema } from '../../../schemas/infoQuestion.js';

const assets = new URL(
  '../../../../../course-agent-worker/skills/course-content-authoring/assets/',
  import.meta.url,
);
const qids = ['dynamicProgramming/overlappingSubproblems', 'dynamicProgramming/staircase'];

describe('course-agent authoring examples', () => {
  it('ships schema-compatible metadata with unique IDs and resolvable assessment questions', async () => {
    const uuids = new Set<string>();
    for (const qid of qids) {
      const question = QuestionJsonSchema.parse(
        JSON.parse(await readFile(new URL(`questions/${qid}/info.json`, assets), 'utf8')),
      );
      expect(uuids.has(question.uuid)).toBe(false);
      uuids.add(question.uuid);
      expect(await readFile(new URL(`questions/${qid}/question.html`, assets), 'utf8')).not.toBe(
        '',
      );
    }
    for (const name of ['dynamicProgrammingHomework', 'dynamicProgrammingQuiz']) {
      const assessment = AssessmentJsonSchema.parse(
        JSON.parse(
          await readFile(new URL(`assessments/${name}/infoAssessment.json`, assets), 'utf8'),
        ),
      );
      expect(uuids.has(assessment.uuid)).toBe(false);
      uuids.add(assessment.uuid);
      const ids = assessment.zones.flatMap((zone) => zone.questions.map((question) => question.id));
      expect(ids).toEqual(qids);
    }
  });

  it('computes the staircase answer correctly for every generated input', () => {
    execFileSync(
      'python3',
      [
        '-c',
        `
import importlib.util
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("staircase", ${JSON.stringify(new URL('questions/dynamicProgramming/staircase/server.py', assets).pathname)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
for n, expected in [(4, 5), (5, 8), (6, 13), (7, 21), (8, 34), (9, 55)]:
    data = {"params": {}, "correct_answers": {}}
    with patch.object(module.random, "randint", return_value=n):
        module.generate(data)
    assert data["params"] == {"n": n, "ways": expected}
    assert data["correct_answers"]["ways"] == expected
`,
      ],
      { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } },
    );
  });
});
