import { features } from '../../lib/features/index.js';
import { selectConversations } from '../../models/course-agent-conversation.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { selectCourseById, updateCourseColumn } from '../../models/course.js';

import { createTest, expect } from './fixtures.js';

const test = createTest({
  isEnterprise: true,
  githubClientToken: 'fixture-no-github-network',
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
  await page.getByRole('button', { name: 'Send', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
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
  await updateCourseColumn({
    courseId,
    columnName: 'branch',
    value: 'changed-branch',
    authnUserId: '1',
  });
  try {
    await page.reload();
    await expect(
      page.getByText('The course repository or branch changed. Start a new conversation.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(page.getByText('Please inspect the course.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toBeEnabled();
  } finally {
    await updateCourseColumn({ courseId, columnName: 'branch', value: 'main', authnUserId: '1' });
  }
});

test('failed preparation returns a native tool error and never displays an approval request', async ({
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
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByLabel('Message', { exact: true }).fill('Prepare a change.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Prepare a change.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  const [conversation] = await selectConversations({
    course_id: courseId,
    user_id: '1',
    authn_user_id: '1',
  });
  const root = `http://localhost:8791/agents/chat/${conversation.external_id}`;
  const headers = {
    Authorization: 'Bearer local-fixture-service-token-not-a-secret',
    'Content-Type': 'application/json',
  };
  const approval = await fetch(`${root}/test/host-tool`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'push_sync',
      input: { baseSha: '0'.repeat(40), proposedSha: 'b'.repeat(40) },
    }),
  });
  expect(approval.ok).toBe(true);
  await expect(page.getByText('Code change request', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('group').getByText(/^Initialize the course repository/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(page.getByText('Code change · Review requested', { exact: true })).toHaveCount(0);
  await expect
    .poll(async () => {
      const response = await fetch(`${root}/test/status`, { headers });
      const state = await response.json();
      return state.toolResults?.[0]?.success;
    })
    .toBe(false);
  await page.getByLabel('Message', { exact: true }).fill('Next request');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled({
    timeout: 20000,
  });
  let release!: () => void;
  const loading = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/course-agent/*/events', async (route) => {
    await loading;
    await route.continue();
  });
  await page.reload();
  await expect(page.getByText('Loading conversation', { exact: true })).toBeVisible();
  await expect(page.getByText('Connecting to conversation…', { exact: true })).toBeVisible();
  await expect(page.getByText('Code change request', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('course-agent-loading.png'), fullPage: true });
  release();
  await expect(page.getByText('Code change request', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await page.unroute('**/course-agent/*/events');
  const proposal = {
    id: '00000000-0000-4000-8000-000000000001',
    digest: 'fixture',
    baseSha: 'a'.repeat(40),
    proposedSha: 'b'.repeat(40),
    status: 'pending',
    diff: '+hello\n',
  };
  await page.route('**/course-agent/*/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ messages: [{ id: 'empty-tool', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'file_change', toolCallId: 'empty', state: 'output-available' }] }], operationNumber: 0, diagnostics: { cleanup: { error: 'Technical cleanup failure' }, checkpointError: 'Technical checkpoint failure' }, blocked: true, approval: proposal, approvals: [proposal, { ...proposal, id: 'approved', status: 'approved' }, { ...proposal, id: 'denied', status: 'denied' }], publication: { status: 'ready', repository: 'example/course', branch: 'main' } })}\n\n`,
    }),
  );
  await page.reload();
  await expect(page.getByText('Edited files', { exact: true })).toBeVisible();
  await expect(page.getByText('undefined', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Edited files', { exact: true }).locator('..').locator('..'),
  ).not.toHaveJSProperty('tagName', 'SUMMARY');
  await expect(
    page.getByText('Act on the code change request before sending a message.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Send', exact: true }).locator('..').hover();
  const pendingTooltip = page.getByRole('tooltip');
  await expect(pendingTooltip).toHaveText(
    'A code change is pending approval. After approving or denying it, you can send a message.',
  );
  await expect(pendingTooltip).toHaveAttribute('data-popper-placement', 'top');
  await page.screenshot({
    path: testInfo.outputPath('course-agent-pending-approval-tooltip.png'),
    animations: 'disabled',
  });
  await page.getByLabel('Message', { exact: true }).hover();
  await expect(pendingTooltip).toHaveCount(0);
  await expect(page.getByText('Review requested', { exact: true })).toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Denied', { exact: true })).toBeVisible();
  const approvedBar = page
    .getByRole('region', { name: 'Code change', exact: true })
    .filter({ has: page.getByText('Approved', { exact: true }) });
  const barBounds = await approvedBar.boundingBox();
  const viewBounds = await approvedBar
    .getByRole('button', { name: 'View changes', exact: true })
    .boundingBox();
  expect(viewBounds!.x + viewBounds!.width).toBeCloseTo(barBounds!.x + barBounds!.width - 9, 0);

  await expect(
    page.getByText('We couldn’t finish cleaning up the workspace.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry cleanup', exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'We couldn’t save the latest file changes. Some changes may be lost if the workspace restarts.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('course-agent-review-states.png'),
    animations: 'disabled',
  });
  await expect(page.getByText('+hello', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View changes', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('+hello', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('course-agent-diff.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const pendingBar = page
    .getByRole('region', { name: 'Code change', exact: true })
    .filter({ has: page.getByText('Review requested', { exact: true }) });
  const view = await pendingBar
    .getByRole('button', { name: 'View changes', exact: true })
    .boundingBox();
  const approve = await pendingBar
    .getByRole('button', { name: 'Approve', exact: true })
    .boundingBox();
  const deny = await pendingBar.getByRole('button', { name: 'Deny', exact: true }).boundingBox();
  expect(view!.x).toBeLessThan(approve!.x);
  expect(approve!.x).toBeLessThan(deny!.x);
  for (const action of ['Approve', 'Deny']) {
    let releaseDecision!: () => void;
    const decisionGate = new Promise<void>((resolve) => {
      releaseDecision = resolve;
    });
    await page.route('**/trpc/courseAgent.decide', async (route) => {
      await decisionGate;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ result: { data: { json: null } } }),
      });
    });
    await pendingBar.getByRole('button', { name: action, exact: true }).click();
    const loadingAction = action === 'Approve' ? 'Approving…' : 'Denying…';
    await expect(
      pendingBar.getByRole('button', { name: loadingAction, exact: true }),
    ).toBeDisabled();
    await expect(
      pendingBar.getByRole('button', {
        name: action === 'Approve' ? 'Deny' : 'Approve',
        exact: true,
      }),
    ).toBeDisabled();
    await pendingBar.getByRole('button', { name: 'View changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    releaseDecision();
    await expect(pendingBar.getByRole('button', { name: action, exact: true })).toBeEnabled();
    await page.unroute('**/trpc/courseAgent.decide');
  }
  for (const status of ['approved', 'denied']) {
    await page.unroute('**/course-agent/*/events');
    const approval = { ...proposal, status };
    await page.route('**/course-agent/*/events', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ messages: [], operationNumber: 0, blocked: false, approval, approvals: [approval], publication: { status: 'retry', error: 'Result delivery interrupted. Retry completion.', repository: 'example/course', branch: 'main' } })}\n\n`,
      }),
    );
    await page.reload();
    await expect(
      page.getByText(status === 'approved' ? 'Approved' : 'Denied', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry completion', exact: true })).toBeVisible();
  }
  for (const status of ['publishing', 'syncing']) {
    await page.unroute('**/course-agent/*/events');
    const approval = { ...proposal, status: 'approved' };
    await page.route('**/course-agent/*/events', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ messages: [], operationNumber: 0, blocked: true, approval, approvals: [approval], publication: { status, repository: 'example/course', branch: 'main' } })}\n\n`,
      }),
    );
    await page.reload();
    await expect(
      page.getByText(status === 'syncing' ? 'Syncing course…' : 'Publishing…', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry completion', exact: true })).toHaveCount(
      0,
    );
  }
  for (const state of ['starting', 'waiting_for_agent']) {
    await page.unroute('**/course-agent/*/events');
    await page.route('**/course-agent/*/events', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ messages: [], operationNumber: 0, blocked: state === 'waiting_for_agent', approvals: [], diagnostics: { state } })}\n\n`,
      }),
    );
    await page.reload();
    await expect(
      page.getByText(state === 'starting' ? 'Starting agent…' : 'Working…', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(state === 'starting' ? 'Working…' : 'Starting agent…', { exact: true }),
    ).toHaveCount(0);
    const creator = page.getByRole('button', { name: 'New conversation', exact: true });
    if (state === 'starting') {
      await expect(creator).toBeDisabled();
    } else {
      await expect(creator).toBeEnabled();
    }
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    const createItem = page.getByRole('button', { name: 'New conversation', exact: true }).first();
    if (state === 'starting') {
      await expect(createItem).toBeDisabled();
    } else {
      await expect(createItem).toBeEnabled();
    }
  }
});

test('navigation during the first send recovers even with malformed stored settings', async ({
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
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  let received!: () => void;
  const receiving = new Promise<void>((resolve) => {
    received = resolve;
  });
  let release!: () => void;
  const holding = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/trpc/courseAgent.send', async (route) => {
    received();
    await holding;
    await route.abort().catch(() => {});
  });
  await page.getByLabel('Message', { exact: true }).fill('Preserve my pending startup message');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await receiving;
  const conversations = await selectConversations({
    course_id: courseId,
    user_id: '1',
    authn_user_id: '1',
  });
  expect(conversations[0]).toBeTruthy();
  await page.evaluate((id) => {
    const key = `course-agent:1:${id}`;
    sessionStorage.setItem(`${key}:settings`, '{invalid');
    sessionStorage.setItem(`${key}:panel`, '{invalid');
  }, courseId);
  await page.getByRole('link', { name: 'Questions', exact: true }).click();
  release();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
    'Preserve my pending startup message',
  );
  await page.unroute('**/trpc/courseAgent.send');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('');
  expect(
    await selectConversations({ course_id: courseId, user_id: '1', authn_user_id: '1' }),
  ).toHaveLength(conversations.length);
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  await expect(page.getByText('Preserve my pending startup message', { exact: true })).toHaveCount(
    1,
  );
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
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.getByLabel('Message', { exact: true }).fill('Saved selection');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.evaluate((id) => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(`course-agent:1:${id}:`) && key.endsWith(':pending')) {
        sessionStorage.setItem(key, '{invalid');
      }
    }
  }, courseId);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).not.toHaveText(
    'New conversation',
  );
  // The selected title is server-rendered; restored history confirms React's
  // handlers are attached before exercising a selection and immediate navigation.
  await expect(page.getByText('Saved selection', { exact: true })).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
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
  await expect(page.getByRole('button', { name: 'Conversation', exact: true })).toHaveText(
    'New conversation',
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
