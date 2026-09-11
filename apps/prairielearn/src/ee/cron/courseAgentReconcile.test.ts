import { beforeEach, expect, it, vi } from 'vitest';

import { config } from '../../lib/config.js';

const mock = vi.hoisted(() => ({
  rows: vi.fn(),
  enabled: vi.fn(),
  snapshot: vi.fn(),
  approval: vi.fn(),
  settings: vi.fn(),
  user: vi.fn(),
  context: vi.fn(),
  decide: vi.fn(),
}));
vi.mock('../../lib/features/index.js', () => ({ features: { enabled: mock.enabled } }));
vi.mock('../../lib/authz-data.js', () => ({ constructCourseOrInstanceContext: mock.context }));
vi.mock('../../models/course-agent.js', () => ({
  selectCourseAgentConversationsToReconcile: mock.rows,
}));
vi.mock('../../models/user.js', () => ({ selectOptionalUserById: mock.user }));
vi.mock('../../models/user-settings.js', () => ({ selectUserSettings: mock.settings }));
vi.mock('../lib/course-agent/reconcile.js', () => ({
  reconcileCourseAgentConversation: mock.snapshot,
}));
vi.mock('../lib/course-agent/publication.js', () => ({
  reconcileCourseAgentPushApproval: mock.approval,
}));
vi.mock('../lib/course-agent/approval-decisions.js', () => ({
  resolveCourseAgentApproval: mock.decide,
}));

import { run } from './courseAgentReconcile.js';

beforeEach(() => {
  vi.resetAllMocks();
  config.courseAgentRuntime = 'cloudflare';
  mock.rows.mockResolvedValue([
    {
      conversation: { id: 'conversation', user_id: 'owner', sandbox_id: 'sandbox' },
      course: { id: 'course', institution_id: 'institution', example_course: false },
      run: { id: 'run' },
    },
  ]);
  mock.enabled.mockResolvedValue(true);
  mock.snapshot.mockResolvedValue({
    activeRunId: 'run',
    sandboxState: 'offline',
    pendingApproval: { id: 'approval' },
  });
  mock.approval.mockResolvedValue({ id: 'approval', status: 'pending' });
  mock.settings.mockResolvedValue({ course_agent_approval_mode: 'ask' });
  mock.user.mockResolvedValue({ id: 'owner' });
  mock.context.mockResolvedValue({ authzData: { has_course_permission_own: true } });
});

it('prepares and reconciles approval even when the sandbox is offline and no browser is open', async () => {
  await run();
  expect(mock.approval).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: 'conversation',
      sandboxId: 'sandbox',
      userId: 'owner',
      runId: 'run',
    }),
  );
  expect(mock.decide).not.toHaveBeenCalled();
});

it.each([true, false])(
  'rechecks current ownership before honoring always-approve (%s)',
  async (owns) => {
    mock.settings.mockResolvedValue({ course_agent_approval_mode: 'always' });
    mock.context.mockResolvedValue({ authzData: { has_course_permission_own: owns } });
    await run();
    expect(mock.context).toHaveBeenCalledWith(
      expect.objectContaining({
        is_administrator: false,
        course_id: 'course',
        user: { id: 'owner' },
      }),
    );
    expect(mock.decide).toHaveBeenCalledTimes(owns ? 1 : 0);
  },
);

it('does nothing when the feature is disabled', async () => {
  mock.enabled.mockResolvedValue(false);
  await run();
  expect(mock.snapshot).not.toHaveBeenCalled();
  expect(mock.decide).not.toHaveBeenCalled();
});
