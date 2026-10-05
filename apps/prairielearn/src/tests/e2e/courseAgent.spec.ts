import { features } from '../../lib/features/index.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { selectCourseById, updateCourseColumn } from '../../models/course.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  isEnterprise: true,
  redisUrl: 'redis://localhost:6379',
  features: { 'course-agent': true },
  courseAgent: {
    workerUrl: 'http://localhost:8791',
    serviceToken: 'local-fixture-service-token-not-a-secret',
    pricing: { 'fixture-model': { input: 0, cachedInput: 0, output: 0 } },
    maxConcurrentPerUser: 2,
    maxConcurrentPerCourse: 5,
    maxRequestsPerHour: 30,
    dailyCostLimit: 20,
  },
});
test.skip(!process.env.COURSE_AGENT_FIXTURE_URL, 'Run the local course-agent fixture first.');
test('conversation and unsent draft persist across course pages', async ({
  page,
  courseInstance,
}, testInfo) => {
  test.setTimeout(60_000);
  const courseId = courseInstance.course_id;
  await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid: 'dev@example.com',
    course_role: 'Owner',
    authn_user_id: '1',
  });
  await updateCourseColumn({
    courseId,
    columnName: 'repository',
    value: 'https://github.com/example/course.git',
    authnUserId: '1',
  });
  await updateCourseColumn({ courseId, columnName: 'branch', value: 'main', authnUserId: '1' });
  await page.goto(`/pl/course/${courseId}/course_admin/settings`);
  await page.getByRole('button', { name: 'Open course agent' }).click();
  await expect(page.getByText('What would you like to work on?', { exact: true })).toBeVisible();
  const composer = page.getByLabel('Message', { exact: true });
  await expect(composer).toBeVisible();
  await composer.fill('Please inspect the course.');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await page.route('**/trpc/courseAgent.send', (route) => route.abort(), { times: 1 });
  await composer.press('Enter');
  await expect(composer).toHaveValue('Please inspect the course.');
  await composer.press('Enter');
  await expect(composer).toHaveValue('');
  await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).toHaveText(
    /\d{1,2}:\d{2} (AM|PM)/,
  );
  await expect(page.getByText('Working…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
  await expect(page.getByText('Started.', { exact: true })).toHaveCount(1);
  await composer.fill('Use a different approach.');
  await composer.press('Enter');
  await expect(page.getByText('Use a different approach.', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Started.', { exact: true })).toHaveCount(1);
  await composer.fill('Keep counting.');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await composer.press('Enter');
  await expect(page.getByText('Keep counting.', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Started.', { exact: true })).toHaveCount(1);
  // Wait for steering to be accepted before checking persisted history after reload.
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  let releaseReplay!: () => void;
  const replayGate = new Promise<void>((resolve) => {
    releaseReplay = resolve;
  });
  let replayContinued!: () => void;
  const replayContinuation = new Promise<void>((resolve) => {
    replayContinued = resolve;
  });
  await page.route('**/course-agent/*/stream', async (route) => {
    await replayGate;
    await route.continue();
    replayContinued();
  });
  await page.reload();
  await expect(page.getByText(/^(Running|Command): sleep 8$/)).toBeVisible();
  await expect(page.getByText('Keep counting.', { exact: true })).toHaveCount(1);
  releaseReplay();
  await replayContinuation;
  await page.unroute('**/course-agent/*/stream');
  const conversationTitle = await page
    .getByRole('button', { name: 'Conversation', exact: true })
    .innerText();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByLabel('Working', { exact: true })).toBeVisible();
  const unread = page.getByLabel('New response', { exact: true });
  await expect(unread).toBeVisible({ timeout: 20000 });
  const dot = await unread.boundingBox();
  expect(dot!.width).toBe(dot!.height);
  const selector = await page
    .getByRole('button', { name: 'Conversation', exact: true })
    .boundingBox();
  const menu = await page
    .getByRole('button', { name: conversationTitle, exact: false })
    .locator('..')
    .boundingBox();
  expect(menu!.x).toBeCloseTo(selector!.x, 0);
  expect(menu!.width).toBeCloseTo(selector!.width, 0);
  await page.getByRole('button', { name: conversationTitle, exact: false }).click();
  await expect(page.getByText('Use a different approach.', { exact: true })).toHaveCount(1);
  const history = await page.getByRole('complementary', { name: 'Course agent' }).innerText();
  expect(history.indexOf('Use a different approach.')).toBeGreaterThan(history.indexOf('Started.'));
  expect(history.indexOf('Use a different approach.')).toBeLessThan(
    history.indexOf('Keep counting.'),
  );
  expect(history.indexOf('Keep counting.')).toBeLessThan(history.indexOf('Finished.'));
  await expect(page.getByText('Started.', { exact: true })).toHaveCount(1);
  await composer.fill('Keep this draft.');
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  await expect(page).toHaveURL(`/pl/course/${courseId}/course_admin/questions`);
  // Drafts restore after hydration, which may wait for on-demand asset builds in CI.
  await expect(composer).toHaveValue('Keep this draft.', { timeout: 15000 });
  await expect(page.getByText('Use a different approach.', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished.', { exact: false })).toBeVisible({ timeout: 20000 });
  await page.reload();
  await expect(composer).toHaveValue('Keep this draft.', { timeout: 15000 });
  await page.route(
    '**/course-agent/*/events',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ': scheduled close\n\n',
      }),
    { times: 1 },
  );
  await page.reload();
  await expect(composer).toHaveValue('Keep this draft.', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await expect(page.getByRole('button', { name: 'Reconnect', exact: true })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Course agent' })).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await expect(page.getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conversation statistics' })).toBeVisible();
  await expect(page.getByLabel('Sandbox diagnostics')).toContainText('waiting_for_user');
  await expect(page.getByLabel('Sandbox diagnostics')).toContainText('remaining');
  await page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Conversation statistics' }) })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(page.getByRole('heading', { name: 'Conversation statistics' })).toBeHidden();
  const navbar = await page.getByRole('navigation', { name: 'Global navigation' }).boundingBox();
  const panel = await page.getByRole('complementary', { name: 'Course agent' }).boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(navbar!.y + navbar!.height);
  const statistics = await page
    .getByRole('button', { name: 'Statistics', exact: true })
    .boundingBox();
  const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  expect(statistics!.width).toBe(send!.width);
  expect(statistics!.height).toBe(send!.height);
  await page.screenshot({ path: testInfo.outputPath('course-agent.png'), fullPage: true });
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(page.getByRole('complementary', { name: 'Course agent' })).toHaveCSS(
    'width',
    '350px',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer).toBeVisible();
  const mobilePanel = page.getByRole('dialog', { name: 'Course agent' });
  await mobilePanel.getByRole('button', { name: 'Close course agent' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() => mobilePanel.evaluate((panel) => panel.contains(document.activeElement)))
    .toBe(true);
  await expect(mobilePanel).toHaveCSS('transform', 'none');
  expect(await mobilePanel.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('course-agent-mobile.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open course agent' })).toBeFocused();
  await page.getByRole('button', { name: 'Open course agent' }).click();
  await expect(mobilePanel).toBeVisible();

  await page.getByRole('button', { name: 'Close course agent' }).click();
  await expect(page.getByRole('button', { name: 'Open course agent' })).toBeVisible();
  await page.getByRole('button', { name: 'Open course agent' }).click();
  await composer.fill('Stop this request.');
  await composer.press('Enter');
  const stopButton = page.getByRole('button', { name: 'Stop', exact: true });
  await expect(stopButton).toBeEnabled();
  await composer.fill('Follow-up steering');
  await expect(stopButton).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await composer.fill('');
  await expect(stopButton).toBeEnabled();
  await stopButton.click();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  const course = await selectCourseById(courseId);
  const featureContext = { institution_id: course.institution_id, course_id: courseId };
  await features.disable('course-agent', featureContext);
  try {
    await page.reload();
    await expect(page.getByText('New messages are disabled.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'New conversation', exact: true }),
    ).toBeDisabled();
    await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
  } finally {
    await features.delete('course-agent', featureContext);
  }
});

test('navigation preserves a new-conversation selection before the settings request finishes', async ({
  page,
  courseInstance,
}) => {
  const courseId = courseInstance.course_id;
  await insertCoursePermissionsByUserUid({
    course_id: courseId,
    uid: 'dev@example.com',
    course_role: 'Owner',
    authn_user_id: '1',
  });
  await updateCourseColumn({
    courseId,
    columnName: 'repository',
    value: 'https://github.com/example/course.git',
    authnUserId: '1',
  });
  await updateCourseColumn({ courseId, columnName: 'branch', value: 'main', authnUserId: '1' });
  await page.goto(`/pl/course/${courseId}/course_admin/settings`);
  await page.getByRole('button', { name: 'Open course agent' }).click();
  await page.getByLabel('Message', { exact: true }).fill('Saved selection');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  // The selected title is server-rendered; restored history confirms React's
  // handlers are attached before exercising a selection and immediate navigation.
  await expect(page.getByText('Saved selection', { exact: true })).toBeVisible({ timeout: 15000 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/trpc/courseAgent.panel', async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).toHaveText(
    'New conversation',
  );
  await page.getByLabel('Message', { exact: true }).fill('Draft in the new conversation');
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  // The server renders the older selection; recovery waits for the new page's JS bundles.
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).toHaveText(
    'New conversation',
    { timeout: 15000 },
  );
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
    'Draft in the new conversation',
  );
  const saved = page.waitForResponse('**/trpc/courseAgent.panel');
  release();
  await saved;
  await page.unroute('**/trpc/courseAgent.panel');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).toHaveText(
    'New conversation',
  );
});
const unavailableTest = createTest({
  isEnterprise: true,
  features: { 'course-agent': true },
  courseAgent: { workerUrl: 'http://localhost:8791', serviceToken: null },
});

unavailableTest(
  'explains the missing connection token without opening chat',
  async ({ page, courseInstance }) => {
    await insertCoursePermissionsByUserUid({
      course_id: courseInstance.course_id,
      uid: 'dev@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/settings`);
    const launcher = page.getByRole('button', { name: 'Open course agent' });
    await expect(launcher).toBeVisible();
    await expect(launcher).toBeDisabled();
    const trigger = launcher.locator('..');
    await trigger.hover();
    await expect(page.getByRole('tooltip')).toContainText('connection token is not configured');
    await page.getByRole('navigation', { name: 'Global navigation' }).hover();
    await trigger.focus();
    await expect(page.getByRole('tooltip')).toContainText('connection token is not configured');
    await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0);
  },
);
