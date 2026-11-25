import { type Course, type Question, type User } from '../lib/db-types.js';
import { selectGroupById, selectGroupMembers } from '../lib/groups.js';
import { idsEqual } from '../lib/id.js';
import { selectStudentLabelNamesForUsers } from '../models/student-label.js';
import { selectUserById } from '../models/user.js';

export interface QuestionUser {
  uid: string;
  uin: string | null;
  name: string | null;
  labels: string[];
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
  /** The variant's course instance, or `null` for course-level previews. */
  courseInstanceId: string | null;
}

const EMPTY_USER_CONTEXT: QuestionUserContext = { user: null, group: null };

/**
 * Build the user/group context to expose to `server.py` for a question phase.
 *
 * Gating rules (all must be true to expose any data):
 *   1. The question is not shared (`share_publicly` / `share_source_publicly` are
 *      both false). A shared question never receives user data, in any context.
 *      This closes the public-preview leak: a public preview renders the question
 *      inside its own original course, so the course-id check below would otherwise
 *      pass and expose the viewer's identity.
 *   2. The question's original course has `questions_receive_user_data = true`.
 *   3. The question is rendered in its original course (`question.course_id === caller.variantCourse.id`).
 *      This excludes sharing-set imports and instructor preview of foreign questions,
 *      which are shared to specific courses without setting the public-share flags.
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
  question: Pick<Question, 'course_id' | 'share_publicly' | 'share_source_publicly'>;
  /** The question's original course; `questions_receive_user_data` is the opt-in switch. */
  course: Pick<Course, 'questions_receive_user_data'>;
  caller: QuestionCaller;
}): Promise<QuestionUserContext> {
  if (question.share_publicly || question.share_source_publicly) return EMPTY_USER_CONTEXT;
  if (!course.questions_receive_user_data) return EMPTY_USER_CONTEXT;
  if (!idsEqual(question.course_id, caller.variantCourse.id)) return EMPTY_USER_CONTEXT;

  const { userId, groupId, courseInstanceId } = caller;

  if (groupId != null) {
    const group = await selectGroupById(groupId);
    if (group.deleted_at != null) return EMPTY_USER_CONTEXT;

    const members = await selectGroupMembers(groupId);
    return {
      user: null,
      group: { name: group.name, members: await buildQuestionUsers(members, courseInstanceId) },
    };
  }

  if (userId != null) {
    const user = await selectUserById(userId);

    const [questionUser] = await buildQuestionUsers([user], courseInstanceId);
    return { user: questionUser, group: null };
  }

  return EMPTY_USER_CONTEXT;
}

async function buildQuestionUsers(
  users: User[],
  courseInstanceId: string | null,
): Promise<QuestionUser[]> {
  const labelsByUserId =
    courseInstanceId == null
      ? new Map<string, string[]>()
      : await selectStudentLabelNamesForUsers({
          userIds: users.map((user) => user.id),
          courseInstanceId,
        });
  return users.map(({ id, uid, uin, name }) => ({
    uid,
    uin,
    name,
    labels: labelsByUserId.get(id) ?? [],
  }));
}
