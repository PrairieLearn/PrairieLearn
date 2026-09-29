import { makeAssessmentInstance } from '../../lib/assessment.js';
import { getAssessmentInstanceUrl } from '../../lib/client/url.js';
import { selectAssessmentInstanceById } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

test('changing the time limit from instance details only updates that instance', async ({
  page,
  courseInstance,
}) => {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam1-automaticTestSuite',
  });
  const instanceIds = [];
  for (const index of [1, 2]) {
    const user = await getOrCreateUser({
      uid: `assessment_instance_actions_${index}@example.com`,
      name: `Assessment Instance Actions Test User ${index}`,
      uin: `12345000${index}`,
    });
    instanceIds.push(
      await makeAssessmentInstance({
        assessment,
        user_id: user.id,
        authn_user_id: user.id,
        mode: 'Public',
        time_limit_min: 30,
        date: new Date(),
        client_fingerprint_id: null,
      }),
    );
  }
  const [targetId, otherId] = instanceIds;
  const targetBefore = await selectAssessmentInstanceById(targetId);
  const otherBefore = await selectAssessmentInstanceById(otherId);

  await page.goto(
    getAssessmentInstanceUrl({
      courseInstanceId: courseInstance.id,
      assessmentInstanceId: targetId,
    }),
  );
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: 'Change time limit', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Time limit options' }).selectOption('set_total');
  await dialog.getByRole('spinbutton', { name: 'Time value' }).fill('60');
  await Promise.all([
    page.waitForEvent('load'),
    dialog.getByRole('button', { name: 'Set', exact: true }).click(),
  ]);
  await expect(dialog).not.toBeVisible();

  const targetAfter = await selectAssessmentInstanceById(targetId);
  const otherAfter = await selectAssessmentInstanceById(otherId);
  expect(targetAfter.date_limit).toEqual(new Date(targetBefore.date!.getTime() + 60 * 60 * 1000));
  expect(otherAfter.date_limit).toEqual(otherBefore.date_limit);

  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: 'Change time limit', exact: true }).click();
  await expect(dialog).toContainText('Total time limit: 60 min');
});
