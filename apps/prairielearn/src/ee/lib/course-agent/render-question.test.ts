import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  conversation: vi.fn(),
  course: vi.fn(),
  user: vi.fn(),
  feature: vi.fn(),
  context: vi.fn(),
  question: vi.fn(),
  hash: vi.fn(),
  render: vi.fn(),
}));
vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: (_name: string, _options: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../../../models/course-agent.js', () => ({
  selectOptionalCourseAgentConversation: mocks.conversation,
}));
vi.mock('../../../models/course.js', () => ({
  selectOptionalCourseById: mocks.course,
  getCourseCommitHash: mocks.hash,
  getLockNameForCoursePath: (path: string) => path,
}));
vi.mock('../../../models/user.js', () => ({ selectOptionalUserById: mocks.user }));
vi.mock('../../../models/question.js', () => ({ selectOptionalQuestionByQid: mocks.question }));
vi.mock('../../../lib/features/index.js', () => ({ features: { enabled: mocks.feature } }));
vi.mock('../../../lib/authz-data.js', () => ({ constructCourseOrInstanceContext: mocks.context }));
vi.mock('../../../lib/question-render.js', () => ({ getAndRenderVariant: mocks.render }));

import {
  questionRenderDiagnostics,
  renderCourseAgentQuestion,
  renderDiagnostic,
} from './render-question.js';

const identity = { conversationId: 'conversation', courseId: '1', userId: '2' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.conversation.mockResolvedValue({ id: 'conversation' });
  mocks.course.mockResolvedValue({
    id: '1',
    institution_id: '1',
    path: '/course',
    commit_hash: 'abc',
    deleted_at: null,
    example_course: false,
  });
  mocks.user.mockResolvedValue({ id: '2' });
  mocks.feature.mockResolvedValue(true);
  mocks.context.mockResolvedValue({ authzData: { has_course_permission_own: true } });
  mocks.question.mockResolvedValue({ id: '3', course_id: '1', deleted_at: null });
  mocks.hash.mockResolvedValue('abc');
  mocks.render.mockResolvedValue({ variant: { variant_seed: '123', broken: false }, issues: [] });
});

describe('post-sync course-agent rendering', () => {
  it('renders the course-scoped QID and reports the actual seed and synced revision', async () => {
    expect(
      await renderCourseAgentQuestion(identity, { qid: 'nested/question', seed: '123' }),
    ).toEqual({
      success: true,
      qid: 'nested/question',
      seed: '123',
      syncedRevision: 'abc',
      diagnostics: [],
    });
    expect(mocks.question).toHaveBeenCalledWith({ course_id: '1', qid: 'nested/question' });
    expect(mocks.render).toHaveBeenCalledWith(
      null,
      '123',
      expect.objectContaining({
        course: expect.objectContaining({ commit_hash: 'abc' }),
        user: { id: '2' },
      }),
      { issuesLoadExtraData: true },
    );
  });
  it('returns Python output and issues without tracebacks', async () => {
    mocks.render.mockResolvedValue({
      variant: { variant_seed: '123', broken: true },
      issues: [
        {
          instructor_message: 'Generation failed',
          system_data: { courseErrData: { outputBoth: 'Traceback\nNameError: missing' } },
        },
        { instructor_message: 'Invalid element attribute', system_data: null },
      ],
    });
    const result = await renderCourseAgentQuestion(identity, { qid: 'question' });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual([
      'Generation failed\nTraceback\nNameError: missing',
      'Invalid element attribute',
    ]);
  });
  it.each(['missing', 'cross-course'])('rejects %s questions', async (kind) => {
    mocks.question.mockResolvedValue(kind === 'missing' ? null : { course_id: '9' });
    expect((await renderCourseAgentQuestion(identity, { qid: 'question' })).success).toBe(false);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it('requires current ownership', async () => {
    mocks.context.mockResolvedValue({ authzData: { has_course_permission_own: false } });
    expect((await renderCourseAgentQuestion(identity, { qid: 'question' })).success).toBe(false);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it('rejects invalid QIDs before accessing data', async () => {
    await expect(renderCourseAgentQuestion(identity, { qid: '../other' })).rejects.toThrow();
    expect(mocks.conversation).not.toHaveBeenCalled();
  });
  it('does not claim validation of an unsynced checkout', async () => {
    mocks.hash.mockResolvedValue('changed');
    expect(
      (await renderCourseAgentQuestion(identity, { qid: 'question' })).syncedRevision,
    ).toBeNull();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it('does not expose infrastructure exception details', async () => {
    mocks.render.mockRejectedValue(new Error('secret SQL and password'));
    const result = await renderCourseAgentQuestion(identity, { qid: 'question' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret SQL');
  });
  it('bounds and redacts diagnostics while retaining traceback endings', () => {
    expect(
      renderDiagnostic('token=private sk-abc123 https://user:password@example.test'),
    ).not.toMatch(/private|abc123|user:password/);
    const output = renderDiagnostic('x'.repeat(20_000) + 'NameError');
    expect(output.length).toBeLessThanOrEqual(4000);
    expect(output).toContain('NameError');
    expect(
      questionRenderDiagnostics(
        Array.from({ length: 20 }, () => ({
          instructor_message: 'failure',
          student_message: null,
          system_data: null,
        })),
      ),
    ).toHaveLength(10);
  });
});
