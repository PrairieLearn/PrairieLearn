import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  crossLockpoint,
  gradeAssessmentInstance,
  renderText,
  updateAssessmentInstance,
} from '../../lib/assessment.js';
import { canDeleteAssessmentInstance } from '../../lib/assessment.shared.js';
import { AssessmentInstanceSchema, type File } from '../../lib/db-types.js';
import { deleteFile, uploadFile } from '../../lib/file-store.js';
import {
  canUserAssignGroupRoles,
  getGroupConfig,
  getGroupInfo,
  getQuestionGroupPermissions,
  leaveGroup,
  updateGroupRoles,
} from '../../lib/groups.js';
import { idsEqual } from '../../lib/id.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import clientFingerprint from '../../middlewares/clientFingerprint.js';
import logPageView from '../../middlewares/logPageView.js';
import selectAndAuthzAssessmentInstance from '../../middlewares/selectAndAuthzAssessmentInstance.js';
import studentAssessmentAccess from '../../middlewares/studentAssessmentAccess.js';
import { computeNextAllowedGradingTimeMs } from '../../models/instance-question.js';
import { selectVariantsByInstanceQuestion } from '../../models/variant.js';

import {
  InstanceQuestionRowSchema,
  StudentAssessmentInstance,
} from './studentAssessmentInstance.html.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

router.use(selectAndAuthzAssessmentInstance);
router.use(studentAssessmentAccess);

async function ensureUpToDate(locals: ResLocalsForPage<'assessment-instance'>) {
  const updated = await updateAssessmentInstance(
    locals.assessment_instance.id,
    locals.authn_user.id,
  );
  if (updated) {
    // we updated the assessment_instance, so reload it
    // @ts-expect-error This reload doesn't set 'formatted_date'
    locals.assessment_instance = await queryRow(
      sql.select_assessment_instance,
      { assessment_instance_id: locals.assessment_instance.id },
      AssessmentInstanceSchema,
    );
  }
}

async function processFileUpload(req: Request, res: Response) {
  if (!res.locals.assessment_instance.open) {
    throw new HttpStatusError(403, 'Assessment is not open');
  }
  if (!res.locals.assessment.allow_personal_notes) {
    throw new HttpStatusError(403, 'This assessment does not allow personal notes.');
  }
  if (!res.locals.authz_result.active) {
    throw new HttpStatusError(403, 'This assessment is not accepting submissions at this time.');
  }
  if (!req.file) {
    throw new HttpStatusError(400, 'Upload requested but no file provided');
  }
  await uploadFile({
    display_filename: req.file.originalname,
    contents: req.file.buffer,
    type: 'student_upload',
    assessment_id: res.locals.assessment.id,
    assessment_instance_id: res.locals.assessment_instance.id,
    instance_question_id: null,
    user_id: res.locals.user.id,
    authn_user_id: res.locals.authn_user.id,
  });
}

async function processTextUpload(req: Request, res: Response) {
  if (!res.locals.assessment_instance.open) {
    throw new HttpStatusError(403, 'Assessment is not open');
  }
  if (!res.locals.assessment.allow_personal_notes) {
    throw new HttpStatusError(403, 'This assessment does not allow personal notes.');
  }
  if (!res.locals.authz_result.active) {
    throw new HttpStatusError(403, 'This assessment is not accepting submissions at this time.');
  }
  await uploadFile({
    display_filename: req.body.filename,
    contents: Buffer.from(req.body.contents),
    type: 'student_upload',
    assessment_id: res.locals.assessment.id,
    assessment_instance_id: res.locals.assessment_instance.id,
    instance_question_id: null,
    user_id: res.locals.user.id,
    authn_user_id: res.locals.authn_user.id,
  });
}

async function processDeleteFile(req: Request, res: Response) {
  if (!res.locals.assessment_instance.open) {
    throw new HttpStatusError(403, 'Assessment is not open');
  }
  if (!res.locals.assessment.allow_personal_notes) {
    throw new HttpStatusError(403, 'This assessment does not allow personal notes.');
  }
  if (!res.locals.authz_result.active) {
    throw new HttpStatusError(403, 'This assessment is not accepting submissions at this time.');
  }

  // Check the requested file belongs to the current assessment instance
  const validFiles = (res.locals.file_list ?? []).filter((file: File) =>
    idsEqual(file.id, req.body.file_id),
  );
  if (validFiles.length === 0) {
    throw new HttpStatusError(404, `No such file_id: ${req.body.file_id}`);
  }
  const file = validFiles[0];

  if (file.type !== 'student_upload') {
    throw new HttpStatusError(403, `Cannot delete file type ${file.type} for file_id=${file.id}`);
  }

  await deleteFile(file.id, res.locals.authn_user.id);
}

router.post(
  '/',
  asyncHandler(async function (req, res, next) {
    if (
      !res.locals.authz_result.authorized_edit &&
      !res.locals.authz_data.has_course_instance_permission_edit
    ) {
      throw new HttpStatusError(403, 'Not authorized');
    }
    if (
      !res.locals.authz_result.authorized_edit &&
      ['attach_file', 'attach_text', 'delete_file', 'timeLimitFinish', 'leave_group'].includes(
        req.body.__action,
      )
    ) {
      throw new HttpStatusError(403, 'Action is only permitted to students, not staff');
    }

    if (req.body.__action === 'attach_file') {
      await processFileUpload(req, res);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'attach_text') {
      await processTextUpload(req, res);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_file') {
      await processDeleteFile(req, res);
      res.redirect(req.originalUrl);
    } else if (['grade', 'finish', 'timeLimitFinish'].includes(req.body.__action)) {
      if (req.body.__action === 'timeLimitFinish') {
        // Only close if the timer expired due to time limit, not for access end
        if (!res.locals.assessment_instance_time_limit_expired) {
          return res.redirect(req.originalUrl);
        }
      }

      const isFinishing = ['finish', 'timeLimitFinish'].includes(req.body.__action);
      await gradeAssessmentInstance({
        assessment_instance_id: res.locals.assessment_instance.id,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        requireOpen: true,
        close: isFinishing,
        ignoreGradeRateLimit: isFinishing,
        ignoreRealTimeGradingDisabled: isFinishing,
        client_fingerprint_id: res.locals.client_fingerprint_id,
      });

      if (req.body.__action === 'timeLimitFinish') {
        res.redirect(req.originalUrl + '?timeLimitExpired=true');
      } else {
        res.redirect(req.originalUrl);
      }
    } else if (req.body.__action === 'cross_lockpoint') {
      if (!res.locals.authz_result.authorized_edit) {
        throw new HttpStatusError(403, 'Action is only permitted to the assessment owner');
      }
      if (!res.locals.assessment_instance.open || !res.locals.authz_result.active) {
        throw new HttpStatusError(
          403,
          'This assessment is not accepting submissions at this time.',
        );
      }
      const zoneId = IdSchema.parse(req.body.zone_id);
      await crossLockpoint({
        assessmentInstance: res.locals.assessment_instance,
        zoneId,
        authnUser: res.locals.authn_user,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'leave_group') {
      if (!res.locals.authz_result.active) {
        throw new HttpStatusError(400, 'Unauthorized request.');
      }
      await leaveGroup(res.locals.assessment.id, res.locals.user.id, res.locals.authn_user.id);
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/assessment/${res.locals.assessment.id}`,
      );
    } else if (req.body.__action === 'update_group_roles') {
      await updateGroupRoles(
        req.body,
        res.locals.assessment.id,
        res.locals.assessment_instance.team_id,
        res.locals.user.id,
        res.locals.authz_data.has_course_instance_permission_edit,
        res.locals.authn_user.id,
      );
      res.redirect(req.originalUrl);
    } else {
      // The 'regenerate_instance' action is handled in the
      // studentAssessmentAccess middleware, so it doesn't need to be handled
      // here.
      next(new HttpStatusError(400, `unknown __action: ${req.body.__action}`));
    }
  }),
);

router.get(
  '/',
  // We only handle fingerprints on the GET handler. The POST handler won't log
  // page views, and we only want to track fingerprint changes when we'll also
  // have a corresponding page view event to show in the logs.
  clientFingerprint,
  logPageView('studentAssessmentInstance'),
  typedAsyncHandler<
    'assessment-instance',
    {
      has_manual_grading_question: boolean;
      has_auto_grading_question: boolean;
      assessment_text_templated: string | null;
    }
  >(async (req, res, _next) => {
    if (res.locals.assessment.type === 'Homework') {
      await ensureUpToDate(res.locals);
    }
    const instance_question_rows = await queryRows(
      sql.select_instance_questions,
      { assessment_instance_id: res.locals.assessment_instance.id },
      InstanceQuestionRowSchema,
    );
    const allPreviousVariants = await selectVariantsByInstanceQuestion({
      assessment_instance_id: res.locals.assessment_instance.id,
    });
    for (const instance_question of instance_question_rows) {
      instance_question.previous_variants = allPreviousVariants.filter((variant) =>
        idsEqual(variant.instance_question_id, instance_question.id),
      );
      if (instance_question.grade_rate_minutes) {
        instance_question.allowGradeLeftMs = await computeNextAllowedGradingTimeMs({
          instanceQuestionId: instance_question.id,
        });
      }
    }

    res.locals.has_manual_grading_question = instance_question_rows.some(
      (q) => q.max_manual_points || q.manual_points || q.requires_manual_grading,
    );
    res.locals.has_auto_grading_question = instance_question_rows.some(
      (q) => q.max_auto_points || q.auto_points || !q.max_points,
    );
    const assessment_text_templated = renderText(res.locals.assessment, res.locals.urlPrefix);
    res.locals.assessment_text_templated = assessment_text_templated;

    const showTimeLimitExpiredModal = req.query.timeLimitExpired === 'true';

    if (!res.locals.assessment.team_work) {
      res.send(
        StudentAssessmentInstance({
          instance_question_rows,
          showTimeLimitExpiredModal,
          userCanDeleteAssessmentInstance: canDeleteAssessmentInstance(res.locals),
          resLocals: res.locals,
        }),
      );
      return;
    }

    // Get the group config info
    const groupConfig = await getGroupConfig(res.locals.assessment.id);
    const groupInfo = await getGroupInfo(res.locals.assessment_instance.team_id!, groupConfig);
    const userCanAssignRoles =
      groupConfig.has_roles &&
      (canUserAssignGroupRoles(groupInfo, res.locals.user.id) ||
        res.locals.authz_data.has_course_instance_permission_edit);

    if (groupConfig.has_roles) {
      // Get the role permissions. If the authorized user has course instance
      // permission, then role restrictions don't apply.
      if (!res.locals.authz_data.has_course_instance_permission_view) {
        for (const question of instance_question_rows) {
          question.group_role_permissions = await getQuestionGroupPermissions(
            question.id,
            res.locals.assessment_instance.team_id!,
            res.locals.authz_data.user.id,
          );
        }
      }
    }

    res.send(
      StudentAssessmentInstance({
        instance_question_rows,
        showTimeLimitExpiredModal,
        groupConfig,
        groupInfo,
        userCanAssignRoles,
        userCanDeleteAssessmentInstance: canDeleteAssessmentInstance(res.locals),
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
