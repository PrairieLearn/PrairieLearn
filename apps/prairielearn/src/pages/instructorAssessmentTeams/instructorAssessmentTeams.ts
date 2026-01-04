import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { TeamConfigSchema } from '../../lib/db-types.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { parseUniqueValuesFromString } from '../../lib/string-util.js';
import { randomTeams, uploadInstanceTeams } from '../../lib/team-update.js';
import {
  TeamOperationError,
  addUserToTeam,
  createTeam,
  deleteAllTeams,
  deleteTeam,
  leaveTeam,
} from '../../lib/teams.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorAssessmentTeams, TeamUsersRowSchema } from './instructorAssessmentTeams.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * The maximum number of UIDs that can be provided in a single request.
 */
const MAX_UIDS = 50;

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  asyncHandler(async (req, res) => {
    const prefix = assessmentFilenamePrefix(
      res.locals.assessment,
      res.locals.assessment_set,
      res.locals.course_instance,
      res.locals.course,
    );
    const teamsCsvFilename = prefix + 'groups.csv';

    const teamConfigInfo = await sqldb.queryOptionalRow(
      sql.config_info,
      { assessment_id: res.locals.assessment.id },
      TeamConfigSchema,
    );

    if (!teamConfigInfo) {
      res.send(InstructorAssessmentTeams({ resLocals: res.locals }));
      return;
    }

    const teams = await sqldb.queryRows(
      sql.select_team_users,
      { team_config_id: teamConfigInfo.id },
      TeamUsersRowSchema,
    );

    const notAssigned = await sqldb.queryRows(
      sql.select_not_in_team,
      {
        team_config_id: teamConfigInfo.id,
        course_instance_id: teamConfigInfo.course_instance_id,
      },
      z.string(),
    );

    res.send(
      InstructorAssessmentTeams({
        resLocals: res.locals,
        teamsCsvFilename,
        teamConfigInfo,
        teams,
        notAssigned,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_assessment_teams') {
      const job_sequence_id = await uploadInstanceTeams({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        csvFile: req.file,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        authzData: res.locals.authz_data,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'random_assessment_teams') {
      const job_sequence_id = await randomTeams({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        max_team_size: Number(req.body.max_team_size),
        min_team_size: Number(req.body.min_team_size),
        authzData: res.locals.authz_data,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'delete_all') {
      await deleteAllTeams(res.locals.assessment.id, res.locals.authn_user.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_team') {
      await createTeam({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        team_name: req.body.team_name,
        uids: parseUniqueValuesFromString(req.body.uids, MAX_UIDS),
        authn_user_id: res.locals.authn_user.id,
        authzData: res.locals.authz_data,
      }).catch((err) => {
        if (err instanceof TeamOperationError) {
          flash('error', err.message);
        } else {
          throw err;
        }
      });

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_member') {
      for (const uid of parseUniqueValuesFromString(req.body.add_member_uids, MAX_UIDS)) {
        try {
          await addUserToTeam({
            course_instance: res.locals.course_instance,
            assessment: res.locals.assessment,
            team_id: req.body.team_id,
            uid,
            authn_user_id: res.locals.authn_user.id,
            enforceTeamSize: false, // Enforce team size limits (instructors can override limits)
            authzData: res.locals.authz_data,
          });
        } catch (err) {
          if (err instanceof TeamOperationError) {
            flash('error', `Failed to add the user ${uid}: ${err.message}`);
          } else {
            throw err;
          }
        }
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_member') {
      const assessment_id = res.locals.assessment.id;
      const team_id = req.body.team_id;
      const user_id = req.body.user_id;
      await leaveTeam(assessment_id, user_id, res.locals.authn_user.id, team_id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_team') {
      await deleteTeam(res.locals.assessment.id, req.body.team_id, res.locals.authn_user.id);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
