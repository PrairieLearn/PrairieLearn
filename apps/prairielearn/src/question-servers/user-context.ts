import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { type Course, type Question } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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

const EMPTY_CONTEXT: QuestionUserContext = { user: null, group: null };

const QuestionUserSchema = z.object({
  uid: z.string(),
  uin: z.string().nullable(),
  name: z.string().nullable(),
});

const TeamWithMembersSchema = z.object({
  name: z.string(),
  members: z.array(QuestionUserSchema),
});

/**
 * Build the user/group context to expose to `server.py` for a question phase.
 *
 * Gating rules (all must be true to expose data):
 *   1. The question's owning course has `questions_receive_user_data = true`.
 *   2. The question is rendered in its owning course (`question.course_id === variantCourse.id`).
 *      This excludes public sharing, sharing-set imports, and instructor preview of foreign questions.
 *
 * When `effectiveUserId` is provided, that user is included in `user`. When `teamId` is provided
 * (group-work variant), members of the team are included in `group.members`.
 */
export async function buildQuestionUserContext({
  question,
  questionCourse,
  variantCourse,
  effectiveUserId,
  teamId,
}: {
  question: Pick<Question, 'course_id' | 'share_publicly' | 'share_source_publicly'>;
  questionCourse: Pick<Course, 'id' | 'questions_receive_user_data'>;
  variantCourse: Pick<Course, 'id'>;
  effectiveUserId: string | null;
  teamId: string | null;
}): Promise<QuestionUserContext> {
  if (!questionCourse.questions_receive_user_data) return EMPTY_CONTEXT;

  // First-party rendering only. If the variant lives in a different course
  // (sharing-set import or public-share preview), don't expose user data.
  if (!idsEqual(question.course_id, variantCourse.id)) return EMPTY_CONTEXT;

  const user =
    effectiveUserId == null
      ? null
      : await sqldb.queryOptionalRow(
          sql.select_question_user,
          { user_id: effectiveUserId },
          QuestionUserSchema,
        );

  const group = teamId
    ? await sqldb.queryOptionalRow(
        sql.select_team_with_members,
        { team_id: teamId },
        TeamWithMembersSchema,
      )
    : null;

  if (user == null && group == null) return EMPTY_CONTEXT;

  return { user, group };
}
