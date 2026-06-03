import { type Course, type Question } from '../lib/db-types.js';
import { selectGroupMembers, selectOptionalGroupById } from '../lib/groups.js';
import { idsEqual } from '../lib/id.js';
import { selectOptionalUserById } from '../models/user.js';

export interface QuestionUser {
  uid: string;
  uin: string | null;
  name: string | null;
}

export interface QuestionGroup {
  name: string;
  members: QuestionUser[];
}

export interface QuestionUserContext {
  user: QuestionUser | null;
  group: QuestionGroup | null;
}

/**
 * Identity and surrounding-course context for a single question-server call.
 * The question-server uses this to construct the user/group data that
 * `server.py` sees in `data['options']`.
 */
export interface QuestionCaller {
  /** The user making the request, or `null` when none applies (e.g. grading a group variant). */
  effectiveUserId: string | null;
  /** The group owning the variant, or `null` for individual variants. */
  groupId: string | null;
  /** The course in which the variant lives. Differs from the question's course for shared questions. */
  variantCourse: Pick<Course, 'id'>;
}

const EMPTY_USER_CONTEXT: QuestionUserContext = { user: null, group: null };

function toQuestionUser({
  uid,
  uin,
  name,
}: {
  uid: string;
  uin: string | null;
  name: string | null;
}): QuestionUser {
  return { uid, uin, name };
}

/**
 * Build the user/group context to expose to `server.py` for a question phase.
 *
 * Gating rules (all must be true to expose data):
 *   1. The question's owning course has `questions_receive_user_data = true`.
 *   2. The question is rendered in its owning course (`question.course_id === caller.variantCourse.id`).
 *      This excludes public sharing, sharing-set imports, and instructor preview of foreign questions.
 */
export async function buildQuestionUserContext({
  question,
  course,
  caller,
  persistsSharedState,
}: {
  question: Pick<Question, 'course_id'>;
  /** The question's owning course; `questions_receive_user_data` is the opt-in switch. */
  course: Pick<Course, 'questions_receive_user_data'>;
  caller: QuestionCaller;
  /**
   * Whether this call's output is persisted on the variant and reused for every
   * later call. True for `generate`/`prepare`, which bake their result into the
   * variant's stored state; false for `render`/`parse`/`grade`/`test`/`file`,
   * which produce fresh per-call output. On group variants that stored state is
   * shown to every member, so we withhold the caller's identity when it's true.
   */
  persistsSharedState: boolean;
}): Promise<QuestionUserContext> {
  if (!course.questions_receive_user_data) return EMPTY_USER_CONTEXT;
  if (!idsEqual(question.course_id, caller.variantCourse.id)) return EMPTY_USER_CONTEXT;

  // Don't bake a single member's identity into state that the whole group sees.
  const includeUser = !(persistsSharedState && caller.groupId != null);

  const user =
    includeUser && caller.effectiveUserId != null
      ? await selectOptionalUserById(caller.effectiveUserId)
      : null;

  const group = caller.groupId != null ? await selectActiveQuestionGroup(caller.groupId) : null;

  if (user == null && group == null) return EMPTY_USER_CONTEXT;
  return { user: user != null ? toQuestionUser(user) : null, group };
}

async function selectActiveQuestionGroup(group_id: string): Promise<QuestionGroup | null> {
  const group = await selectOptionalGroupById(group_id);
  if (group == null || group.deleted_at != null) return null;
  const members = await selectGroupMembers(group_id);
  return { name: group.name, members: members.map(toQuestionUser) };
}
