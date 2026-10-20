import fs from 'node:fs/promises';
import path from 'node:path';

import * as sqldb from '@prairielearn/postgres';

import { selectAssessmentByTid } from '../../models/assessment.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

test('identifies linked PrairieTest courses and centers, including archived ones', async ({
  page,
  courseInstance,
  testCoursePath,
}) => {
  await sqldb.execute(sql.insert_exam_metadata, {});
  const configPath = path.join(
    testCoursePath,
    'courseInstances/Sp15/assessments/hw19-accessControlUi/infoAssessment.json',
  );
  const assessmentJson = JSON.parse(await fs.readFile(configPath, 'utf8'));
  assessmentJson.accessControl = [
    {
      integrations: {
        prairieTest: {
          exams: [1, 2, 3, 4, 5].map((index) => ({
            examUuid: `09bbefec-6c71-487a-9352-c1b131bb000${index}`,
          })),
        },
      },
    },
  ];
  await fs.writeFile(configPath, JSON.stringify(assessmentJson));
  await syncCourse(testCoursePath);
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'hw19-accessControlUi',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/assessment/${assessment.id}/access`,
  );
  await page.waitForSelector('.js-hydrated-component');
  const table = page.getByRole('table', { name: 'PrairieTest' });
  const rows = table.getByRole('row');
  await expect(table.getByRole('link', { name: 'Exam 3', exact: true })).toHaveCount(4);
  await expect(rows.nth(1)).toContainText('TAM 212 (Fa26), CBTF (Fa26), DRES (Fa26)');
  await expect(rows.nth(1).getByRole('button', { name: 'Archived PrairieTest link' })).toHaveCount(
    0,
  );
  await expect(rows.nth(2)).toContainText('TAM 212 (Fa26), CBTF (Sp26)');
  await expect(rows.nth(3)).toContainText('TAM 212 (Sp26), CBTF (Fa26), DRES (Fa26)');
  await expect(rows.nth(5)).toContainText('Unknown exam');
  await expect(rows.nth(5).getByRole('button', { name: 'Archived PrairieTest link' })).toHaveCount(
    0,
  );

  for (const [index, warnings] of [
    [2, ['Testing center CBTF (Sp26) is archived.']],
    [3, ['Course TAM 212 (Sp26) is archived.']],
    [4, ['Testing center CBTF (Sp26) is archived.', 'Course TAM 212 (Sp26) is archived.']],
  ] as const) {
    const button = rows.nth(index).getByRole('button', { name: 'Archived PrairieTest link' });
    await button.focus();
    await page.keyboard.press('Enter');
    const popover = page.getByRole('tooltip', { name: 'Archived PrairieTest link' });
    await expect(popover).toHaveCSS('opacity', '1');
    await expect(popover.getByRole('listitem')).toHaveCount(warnings.length);
    for (const warning of warnings) {
      await expect(popover).toContainText(warning);
    }
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expect(button).toBeFocused();
  }
});
