import { makeAssessmentInstance } from '../../lib/assessment.js';
import { getAssessmentInstanceUrl } from '../../lib/client/url.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { type AuthUser, getOrCreateUser } from '../utils/auth.js';

import { expect, test } from './fixtures.js';

const TEST_USER: AuthUser = {
  uid: 'assessment_instance_actions_test@example.com',
  name: 'Assessment Instance Actions Test User',
  uin: '123450001',
};

test('instance detail actions submit only the current instance', async ({
  page,
  courseInstance,
}) => {
  const user = await getOrCreateUser(TEST_USER);
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: 'exam1-automaticTestSuite',
  });
  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: 30,
    date: new Date(),
    client_fingerprint_id: null,
  });

  const mutationRequests: { procedure: string; input: unknown }[] = [];
  await page.route('**/trpc/**', async (route) => {
    const request = route.request();
    const match = request.url().match(/\/trpc\/(assessmentInstances\.[^/?]+)/);
    if (request.method() === 'POST' && match) {
      mutationRequests.push({ procedure: match[1], input: request.postDataJSON() });
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto(
    getAssessmentInstanceUrl({
      courseInstanceId: courseInstance.id,
      assessmentInstanceId,
    }),
  );
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible();

  const actions = [
    { menu: 'Grade', title: 'Grade this instance', confirm: 'Grade', procedure: 'grade' },
    {
      menu: 'Grade & close',
      title: 'Grade and close this instance',
      confirm: 'Grade and close',
      procedure: 'gradeAndClose',
    },
    { menu: 'Regrade', title: 'Regrade this instance', confirm: 'Regrade', procedure: 'regrade' },
    {
      menu: 'Change time limit',
      title: 'Change time limit',
      confirm: 'Set',
      procedure: 'setTimeLimit',
    },
    {
      menu: 'Delete',
      title: 'Delete this instance',
      confirm: 'Delete instance',
      procedure: 'delete',
    },
  ];

  for (const action of actions) {
    await page.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('button', { name: action.menu, exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(action.title);

    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes(action.procedure),
    );
    await dialog.getByRole('button', { name: action.confirm }).click();
    await requestPromise;

    const request = mutationRequests.at(-1);
    expect(request?.procedure).toBe(`assessmentInstances.${action.procedure}`);
    expect(request?.input).toMatchObject({
      json: { assessmentInstanceIds: [assessmentInstanceId] },
    });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  }
});
