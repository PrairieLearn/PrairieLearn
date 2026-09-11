import { randomBytes } from 'node:crypto';

import stripAnsi from 'strip-ansi';

import {
  CourseAgentRenderInputSchema,
  type CourseAgentRenderResult,
} from '@prairielearn/course-agent-protocol';
import { doWithLock } from '@prairielearn/named-locks';

import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import type { Issue } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { getAndRenderVariant } from '../../../lib/question-render.js';
import { selectOptionalCourseAgentConversation } from '../../../models/course-agent.js';
import {
  getCourseCommitHash,
  getLockNameForCoursePath,
  selectOptionalCourseById,
} from '../../../models/course.js';
import { selectOptionalQuestionByQid } from '../../../models/question.js';
import { selectOptionalUserById } from '../../../models/user.js';

export function renderDiagnostic(value: string) {
  const clean = stripAnsi(value)
    .replaceAll(/(https?:\/\/)[^/\s@]+@/g, '$1[redacted]@')
    .replaceAll(
      /\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/g,
      '[redacted]',
    )
    .replaceAll(
      /((?:authorization|api[_-]?key|token|password|secret)\s*[:=]\s*)(?:Bearer\s+|Basic\s+)?[^\s,;]+/gi,
      '$1[redacted]',
    );
  return clean.length > 4000
    ? `${clean.slice(0, 1800)}\n[truncated]\n${clean.slice(-2100)}`
    : clean;
}

export function questionRenderDiagnostics(
  issues: Pick<Issue, 'instructor_message' | 'student_message' | 'system_data'>[],
) {
  return issues.slice(0, 10).map((issue) => {
    const output: unknown = issue.system_data?.courseErrData?.outputBoth;
    return renderDiagnostic(
      [
        issue.instructor_message ??
          issue.student_message ??
          'Question generation or rendering failed.',
        typeof output === 'string' ? output : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  });
}

/** Uses the same renderer as AI question generation; never renders unpublished files. */
export async function renderCourseAgentQuestion(
  identity: { conversationId: string; courseId: string; userId: string },
  input: unknown,
): Promise<CourseAgentRenderResult> {
  const parsed = CourseAgentRenderInputSchema.parse(input);
  const result: CourseAgentRenderResult = {
    qid: parsed.qid,
    seed: parsed.seed ?? randomBytes(8).toString('hex'),
    syncedRevision: null,
    success: false,
    diagnostics: [],
  };
  const conversation = await selectOptionalCourseAgentConversation(identity);
  const course = await selectOptionalCourseById(identity.courseId);
  const user = await selectOptionalUserById(identity.userId);
  if (
    !conversation ||
    !course ||
    course.deleted_at ||
    !user ||
    course.example_course ||
    !(await features.enabled('course-agent', {
      institution_id: course.institution_id,
      course_id: course.id,
      user_id: user.id,
    }))
  ) {
    return { ...result, diagnostics: ['This conversation cannot render course questions.'] };
  }
  const context = await constructCourseOrInstanceContext({
    user,
    course_id: course.id,
    course_instance_id: null,
    ip: null,
    req_date: new Date(),
    is_administrator: false,
  });
  if (!context.authzData?.has_course_permission_own) {
    return { ...result, diagnostics: ['Current course ownership is required.'] };
  }

  return doWithLock(
    getLockNameForCoursePath(course.path),
    { timeout: 5000, autoRenew: true },
    async () => {
      const syncedCourse = await selectOptionalCourseById(course.id);
      if (
        !syncedCourse ||
        syncedCourse.deleted_at ||
        !syncedCourse.commit_hash ||
        (await getCourseCommitHash(syncedCourse.path)) !== syncedCourse.commit_hash
      ) {
        return {
          ...result,
          diagnostics: [
            'The course checkout does not match a synced revision. Sync the course before rendering.',
          ],
        };
      }
      result.syncedRevision = syncedCourse.commit_hash;
      const question = await selectOptionalQuestionByQid({ course_id: course.id, qid: parsed.qid });
      if (question?.course_id !== course.id || question.deleted_at) {
        return { ...result, diagnostics: ['QID not found in this course.'] };
      }
      try {
        // The existing code caller terminates Python on questionTimeoutMilliseconds.
        // Do not substitute a Promise.race that leaves course code running in the background.
        const rendered = await getAndRenderVariant(
          null,
          result.seed,
          {
            urlPrefix: '',
            course: syncedCourse,
            question,
            user,
            authn_user: user,
            is_administrator: false,
            issues: [],
          },
          { issuesLoadExtraData: true },
        );
        result.seed = rendered.variant.variant_seed;
        result.diagnostics = questionRenderDiagnostics(rendered.issues);
        if (rendered.variant.broken && result.diagnostics.length === 0) {
          result.diagnostics.push(
            'The generated variant is broken; no rendering diagnostics were recorded.',
          );
        }
        result.success = !rendered.variant.broken && result.diagnostics.length === 0;
        return result;
      } catch {
        // Infrastructure exceptions can contain SQL, credentials, or unrelated data.
        return {
          ...result,
          diagnostics: [
            'PL could not complete question generation/rendering. Check the PL server logs. This question has not been validated.',
          ],
        };
      }
    },
  );
}
