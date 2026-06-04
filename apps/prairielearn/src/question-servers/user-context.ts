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
  /**
   * The user the variant belongs to (its owner), or `null` on group variants.
   */
  userId: string | null;
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
 * Gating rules (all must be true to expose any data):
 *   1. The question's owning course has `questions_receive_user_data = true`.
 *   2. The question is rendered in its owning course (`question.course_id === caller.variantCourse.id`).
 *      This excludes public sharing, sharing-set imports, and instructor preview of foreign questions.
 *
 * On group variants the individual viewing user's identity is never exposed
 * (`user` is `null`); only the stable group roster (`group.members`) is provided,
 * since the variant's state and rendered output are shared across all members.
 */
export async function buildQuestionUserContext({
  question,
  course,
  caller,
}: {
  question: Pick<Question, 'course_id'>;
  /** The question's owning course; `questions_receive_user_data` is the opt-in switch. */
  course: Pick<Course, 'questions_receive_user_data'>;
  caller: QuestionCaller;
}): Promise<QuestionUserContext> {
  if (!course.questions_receive_user_data) return EMPTY_USER_CONTEXT;
  if (!idsEqual(question.course_id, caller.variantCourse.id)) return EMPTY_USER_CONTEXT;

  // On group variants the question's state and rendered output are shared across
  // every member, so we never expose a single member's identity. The group
  // roster (`group.members`, below) is still provided.
  const user =
    caller.groupId == null && caller.userId != null
      ? await selectOptionalUserById(caller.userId)
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
