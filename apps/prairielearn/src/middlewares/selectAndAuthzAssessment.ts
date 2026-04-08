import asyncHandler from 'express-async-handler';
import z from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import {
  type AccessDisplayModel,
  buildLegacyAccessDisplayModel,
} from '../lib/assessment-access-control/access-display.js';
import {
  type ModernAccessRenderInfo,
  resolveModernAssessmentAccess,
} from '../lib/assessment-access-control/authz.js';
import {
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  SprocAuthzAssessmentSchema,
} from '../lib/db-types.js';
import type { ResLocalsForPage } from '../lib/res-locals.js';

import { AccessDenied } from './selectAndAuthzAssessment.html.js';
import { StudentAssessmentAccess } from './studentAssessmentAccess.html.js';

const sql = loadSqlEquiv(import.meta.url);

const SelectAndAuthzAssessmentSchema = z.object({
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema.nullable(),
  authz_result: SprocAuthzAssessmentSchema,
  assessment_label: z.string(),
});

export type ResLocalsAssessment = z.infer<typeof SelectAndAuthzAssessmentSchema> & {
  access_display_model: AccessDisplayModel;
  modern_access_info: ModernAccessRenderInfo | null;
};

export default asyncHandler(async (req, res, next) => {
  const row = await queryOptionalRow(
    sql.select_and_auth,
    {
      assessment_id: req.params.assessment_id,
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    },
    SelectAndAuthzAssessmentSchema,
  );
  if (row === null) {
    res.status(403).send(AccessDenied({ resLocals: res.locals }));
    return;
  }

  let modernAccessInfo: ModernAccessRenderInfo | null = null;

  if (row.assessment.modern_access_control) {
    const modernResult = await resolveModernAssessmentAccess({
      assessment: row.assessment,
      userId: res.locals.authz_data.user.id,
      courseInstance: res.locals.course_instance,
      authzData: res.locals.authz_data,
      reqDate: res.locals.req_date,
    });
    row.authz_result = modernResult.authzResult;
    modernAccessInfo = modernResult.renderInfo;
  }

  const accessDisplayModel = row.assessment.modern_access_control
    ? modernAccessInfo!.accessDisplayModel
    : buildLegacyAccessDisplayModel({
        accessRules: row.authz_result.access_rules,
        active: row.authz_result.active,
        nextActiveTime: row.authz_result.next_active_time,
        listed: row.authz_result.authorized,
      });
  const responseLocals = {
    ...res.locals,
    ...row,
    access_display_model: accessDisplayModel,
    modern_access_info: modernAccessInfo,
  } as ResLocalsForPage<'assessment'>;

  if (!row.authz_result.authorized) {
    if (modernAccessInfo?.availability.listed) {
      Object.assign(res.locals, row, {
        access_display_model: accessDisplayModel,
        modern_access_info: modernAccessInfo,
      });
      res.status(403).send(StudentAssessmentAccess({ resLocals: responseLocals }));
      return;
    }
    res.status(403).send(AccessDenied({ resLocals: res.locals }));
    return;
  }
  Object.assign(res.locals, row, {
    access_display_model: accessDisplayModel,
    modern_access_info: modernAccessInfo,
  });
  next();
});
