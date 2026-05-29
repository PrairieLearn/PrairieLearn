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
 * Identity and surrounding-course context for a single question-server phase
 * invocation. The question-server uses this to construct the user/group data
 * that `server.py` sees in `data['options']`.
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

/**
 * Stage of a variant's lifecycle. Determines whether the caller's user
 * identity may flow into output that other group members will see.
 *
 * - `'create'`: `generate`/`prepare` — produce variant state that is persisted
 *   and reused for every subsequent invocation on the variant. On group
 *   variants, that output is visible to every group member, so we don't expose
 *   one member's identity there.
 * - `'invoke'`: `render`/`parse`/`grade`/`test`/`file` — produce per-call
 *   output for the current caller only.
 */
export type VariantLifecyclePhase = 'create' | 'invoke';

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
  phase,
}: {
  question: Pick<Question, 'course_id'>;
  /** The question's owning course; `questions_receive_user_data` is the opt-in switch. */
  course: Pick<Course, 'questions_receive_user_data'>;
  caller: QuestionCaller;
  phase: VariantLifecyclePhase;
}): Promise<QuestionUserContext> {
  if (!course.questions_receive_user_data) return EMPTY_USER_CONTEXT;
  if (!idsEqual(question.course_id, caller.variantCourse.id)) return EMPTY_USER_CONTEXT;

  // Group variants persist generate/prepare output, so don't bake a single
  // member's identity into that shared state.
  const includeUser = !(phase === 'create' && caller.groupId != null);

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
