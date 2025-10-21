import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { UserSchema } from '../lib/db-types.js';
import { getModeForRequest } from '../lib/exam-mode.js';
import { isEnterprise } from '../lib/license.js';
import { selectCourseById } from '../models/course.js';
import { selectQuestionById } from '../models/question.js';
import { selectAndAuthzVariant } from '../models/variant.js';

import { authzCourseOrInstance } from './authzCourseOrInstance.js';
import { authzHasCoursePreviewOrInstanceView } from './authzHasCoursePreviewOrInstanceView.js';
import { selectAndAuthzInstanceQuestion } from './selectAndAuthzInstanceQuestion.js';
import { selectAndAuthzInstructorQuestion } from './selectAndAuthzInstructorQuestion.js';
import { checkStudentAssessmentAccess } from './studentAssessmentAccess.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SelectAuthDataFromWorkspaceSchema = z.object({
  variant_id: IdSchema,
  question_id: IdSchema,
  instance_question_id: IdSchema.nullable(),
  course_instance_id: IdSchema.nullable(),
  course_id: IdSchema,
});

export default function ({ publicQuestionEndpoint } = { publicQuestionEndpoint: false }) {
  return asyncHandler(async (req, res, next) => {
    // We rely on having res.locals.workspace_id already set to the correct value here
    const result = await sqldb.queryOptionalRow(
      sql.select_auth_data_from_workspace,
      { workspace_id: res.locals.workspace_id },
      SelectAuthDataFromWorkspaceSchema,
    );

    if (!result) {
      // We couldn't find the workspace. Someone could have put in a bad workspace ID,
      // or there could be a dangling workspace after a variant was deleted. Either way,
      // translate this to a 403 the error out of our monitoring.
      //
      // We use a 403 instead of a 404 to avoid leaking information about the existence
      // of particular workspace IDs.
      throw new HttpStatusError(403, 'Access denied');
    }
    Object.assign(res.locals, result);

    if (publicQuestionEndpoint) {
      res.locals.course = await selectCourseById(result.course_id);
      res.locals.user = UserSchema.parse(res.locals.authn_user);
      res.locals.question = await selectQuestionById(result.question_id);
    } else if (result.course_instance_id) {
      req.params.course_instance_id = result.course_instance_id;
      await authzCourseOrInstance(req, res);

      if (isEnterprise()) {
        const { checkPlanGrantsForLocals } = await import('../ee/lib/billing/plan-grants.js');
        const hasPlanGrants = await checkPlanGrantsForLocals(res.locals);
        if (!hasPlanGrants) {
          // TODO: Show a fancier error page explaining what happened and prompting
          // the user to contact their instructor.
          throw new HttpStatusError(403, 'Access denied');
        }
      }

      if (result.instance_question_id) {
        req.params.instance_question_id = result.instance_question_id;
        await selectAndAuthzInstanceQuestion(req, res);
        if (!checkStudentAssessmentAccess(req, res)) {
          // We've already sent a response, just bail.
          return;
        }
      }
    } else if (res.locals.course_id) {
      req.params.course_id = res.locals.course_id;
      await authzCourseOrInstance(req, res);
    } else {
      throw new Error('Workspace has no course and no course instance!');
    }

    if (!publicQuestionEndpoint && !result.instance_question_id) {
      // If we don't have an associated instance question, the variant was created
      // from the instructor question preview and we should authorize for that.
      req.params.question_id = result.question_id;
      // TODO: This is a little hacky. Further context: https://github.com/PrairieLearn/PrairieLearn/pull/12496#discussion_r2240249138
      const authzResult = await authzHasCoursePreviewOrInstanceView(req, res);
      if (authzResult.type === 'body') {
        res.status(403).send(authzResult.html);
        return;
      } else if (authzResult.type === 'redirect') {
        res.redirect(authzResult.url);
        return;
      }
      await selectAndAuthzInstructorQuestion(req, res);

      // We'll deny access to such variants if the user is in Exam mode to prevent
      // a student from using a workspace for a course in which they're an
      // instructor to infiltrate or exfiltrate exam data.
      const { mode } = await getModeForRequest(req, res);
      if (mode !== 'Public') {
        throw new HttpStatusError(403, 'Access denied');
      }
    }

    await selectAndAuthzVariant({
      unsafe_variant_id: result.variant_id,
      variant_course: res.locals.course,
      question_id: result.question_id,
      course_instance_id: res.locals.course_instance?.id,
      instance_question_id: res.locals.instance_question?.id,
      authz_data: res.locals.authz_data,
      authn_user: res.locals.authn_user,
      user: res.locals.user,
      is_administrator: res.locals.is_administrator,
      publicQuestionPreview: publicQuestionEndpoint,
    });

    next();
  });
}
