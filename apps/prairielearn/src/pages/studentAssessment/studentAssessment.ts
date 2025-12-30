import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import mustache from 'mustache';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { markdownToHtml } from '@prairielearn/markdown';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import {
  TeamOperationError,
  canUserAssignTeamRoles,
  createTeam,
  getTeamConfig,
  getTeamId,
  getTeamInfo,
  joinTeam,
  leaveTeam,
  updateTeamRoles,
} from '../../lib/teams.js';
import { getClientFingerprintId } from '../../middlewares/clientFingerprint.js';
import logPageView from '../../middlewares/logPageView.js';
import selectAndAuthzAssessment from '../../middlewares/selectAndAuthzAssessment.js';
import { StudentAssessmentAccess } from '../../middlewares/studentAssessmentAccess.html.js';
import studentAssessmentAccess, {
  checkPasswordOrRedirect,
} from '../../middlewares/studentAssessmentAccess.js';
import studentAssessmentRedirect from '../../middlewares/studentAssessmentRedirect.js';

import { StudentAssessment } from './studentAssessment.html.js';

const router = Router({ mergeParams: true });

router.use(selectAndAuthzAssessment);
router.use(studentAssessmentRedirect);
router.use(studentAssessmentAccess);

router.get(
  '/',
  logPageView('studentAssessmentInstance'),
  asyncHandler(async function (req, res) {
    if (!(res.locals.authz_result?.active ?? true)) {
      // If the student had started the assessment already, they would have been
      // redirected to the assessment instance by the `studentAssessmentRedirect`
      // middleware. So, if we're here, it means that the student did not start
      // the assessment (or that they're trying to start a new instance of a
      // multi-instance assessment), and the assessment is not active.
      //
      // This check means that students will be unable to join a group if an
      // assessment is inactive, which we're deeming to be sensible behavior.
      res.status(403).send(StudentAssessmentAccess({ resLocals: res.locals }));
      return;
    }

    if (res.locals.assessment.multiple_instance && res.locals.assessment.type === 'Homework') {
      throw new AugmentedError('"Homework" assessments do not support multiple instances', {
        data: { assessment: res.locals.assessment },
      });
    }
    // Before allowing the user to create a new assessment instance, we need
    // to check if the current access rules require a password. If they do,
    // we'll ensure that the password has already been entered before allowing
    // students to create and start a new assessment instance.
    if (!checkPasswordOrRedirect(req, res)) return;

    // For homeworks without group work, create the new assessment instance
    // and redirect to it without further student action.
    if (!res.locals.assessment.team_work && res.locals.assessment.type === 'Homework') {
      const time_limit_min = null;
      const client_fingerprint_id = await getClientFingerprintId(req, res);
      const assessment_instance_id = await makeAssessmentInstance({
        assessment: res.locals.assessment,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        mode: res.locals.authz_data.mode,
        time_limit_min,
        date: res.locals.authz_data.date,
        client_fingerprint_id,
      });
      res.redirect(`${res.locals.urlPrefix}/assessment_instance/${assessment_instance_id}`);
      return;
    }

    let customHonorCode = '';
    if (
      res.locals.assessment.type === 'Exam' &&
      res.locals.assessment.require_honor_code &&
      res.locals.assessment.honor_code
    ) {
      customHonorCode = markdownToHtml(
        mustache.render(res.locals.assessment.honor_code, {
          user_name: res.locals.user.name,
        }),
        { allowHtml: false, interpretMath: false },
      );
    }
    if (!res.locals.assessment.team_work) {
      res.send(StudentAssessment({ resLocals: res.locals, customHonorCode }));
      return;
    }

    // Get the group config info
    const teamConfig = await getTeamConfig(res.locals.assessment.id);

    // Check whether the user is currently in a group in the current assessment by trying to get a group_id
    const teamId = await getTeamId(res.locals.assessment.id, res.locals.user.id);

    const teamInfo = teamId === null ? null : await getTeamInfo(teamId, teamConfig);
    const userCanAssignRoles =
      teamInfo != null &&
      teamConfig.has_roles &&
      (canUserAssignTeamRoles(teamInfo, res.locals.user.id) ||
        res.locals.authz_data.has_course_instance_permission_edit);

    res.send(
      StudentAssessment({
        resLocals: res.locals,
        teamConfig,
        teamInfo,
        userCanAssignRoles,
        customHonorCode,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async function (req, res) {
    // No, you do not need to verify authz_result.authorized_edit (indeed, this flag exists
    // only for an assessment instance, not an assessment).
    //
    // The assessment that is created here will be owned by the effective user. The only
    // reason to worry, therefore, is if the effective user has a different UID than the
    // authn user. This is only allowed, however, if the authn user has permission to edit
    // student data in the course instance (which has already been checked), exactly the
    // permission required to create an assessment for the effective user.

    if (req.body.__action === 'new_instance') {
      // Before allowing the user to create a new assessment instance, we need
      // to check if the current access rules require a password. If they do,
      // we'll ensure that the password has already been entered before allowing
      // students to create and start a new assessment instance.
      if (!checkPasswordOrRedirect(req, res)) return;

      if (res.locals.assessment.team_work) {
        const teamConfig = await getTeamConfig(res.locals.assessment.id);
        const teamId = await getTeamId(res.locals.assessment.id, res.locals.user.id);
        if (teamId === null) {
          throw new HttpStatusError(403, 'Cannot create a new instance while not in a group.');
        }
        const teamInfo = await getTeamInfo(teamId, teamConfig);
        if (!teamInfo.start) {
          throw new HttpStatusError(
            403,
            'Group has invalid composition or role assignment. Cannot start assessment.',
          );
        }
      }

      const time_limit_min =
        res.locals.assessment.type === 'Exam' ? res.locals.authz_result.time_limit_min : null;
      const client_fingerprint_id = await getClientFingerprintId(req, res);
      const assessment_instance_id = await makeAssessmentInstance({
        assessment: res.locals.assessment,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        mode: res.locals.authz_data.mode,
        time_limit_min,
        date: res.locals.req_date,
        client_fingerprint_id,
      });
      res.redirect(`${res.locals.urlPrefix}/assessment_instance/${assessment_instance_id}`);
    } else if (req.body.__action === 'join_team') {
      const teamConfig = await getTeamConfig(res.locals.assessment.id);
      if (!teamConfig.student_authz_join) {
        throw new HttpStatusError(403, 'You are not authorized to join a group.');
      }
      await joinTeam({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        fullJoinCode: req.body.join_code,
        uid: res.locals.user.uid,
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
    } else if (req.body.__action === 'create_team') {
      const teamConfig = await getTeamConfig(res.locals.assessment.id);
      if (!teamConfig.student_authz_create) {
        throw new HttpStatusError(403, 'You are not authorized to create a group.');
      }
      await createTeam({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        team_name: teamConfig.student_authz_choose_name ? req.body.team_name : null,
        uids: [res.locals.user.uid],
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
    } else if (req.body.__action === 'update_team_roles') {
      // Check whether the user is currently in a group
      const teamId = await getTeamId(res.locals.assessment.id, res.locals.user.id);
      if (teamId == null) {
        throw new HttpStatusError(403, 'Cannot change group roles while not in a group.');
      }
      await updateTeamRoles(
        req.body,
        res.locals.assessment.id,
        teamId,
        res.locals.user.id,
        res.locals.authz_data.has_course_instance_permission_edit,
        res.locals.authn_user.id,
      );
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'leave_team') {
      const teamConfig = await getTeamConfig(res.locals.assessment.id);
      if (!teamConfig.student_authz_leave) {
        throw new HttpStatusError(403, 'You are not authorized to leave your group.');
      }
      await leaveTeam(res.locals.assessment.id, res.locals.user.id, res.locals.authn_user.id);
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
