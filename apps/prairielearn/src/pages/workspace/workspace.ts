import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { generateSignedToken } from '@prairielearn/signed-token';
import * as workspaceUtils from '@prairielearn/workspace-utils';

import { config } from '../../lib/config.js';
import { selectVariantIdForWorkspace } from '../../models/workspace.js';

import { Workspace } from './workspace.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getNavTitleHref(res: express.Response): Promise<string> {
  const variant_id = await selectVariantIdForWorkspace(res.locals.workspace_id);

  if (res.locals.assessment == null) {
    // Instructor preview. This could be a preview at either the course or course
    // instance level. Generate a link appropriately.
    if (res.locals.course_instance_id) {
      return `/pl/course_instance/${res.locals.course_instance_id}/instructor/question/${res.locals.question_id}/preview?variant_id=${variant_id}`;
    } else {
      return `/pl/course/${res.locals.course_id}/question/${res.locals.question_id}/preview?variant_id=${variant_id}`;
    }
  } else {
    // Student assessment. If it's a homework, we'll include the variant ID in the URL
    // in case this workspace is for a non-current variant.
    const query = res.locals.assessment.type === 'Homework' ? `?variant_id=${variant_id}` : '';
    return `/pl/course_instance/${res.locals.course_instance_id}/instance_question/${res.locals.instance_question_id}${query}`;
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let navTitle: string, pageTitle: string | undefined, pageNote: string | undefined;
    if (res.locals.assessment == null) {
      // instructor preview
      pageTitle = 'Workspace Preview';
      pageNote = res.locals.question_qid;
      navTitle = res.locals.question_qid;
    } else {
      // student assessment
      pageTitle = 'Workspace';
      navTitle = `${res.locals.instance_question_info.question_number} - ${res.locals.course.short_name}`;
    }

    const navTitleHref = await getNavTitleHref(res);

    res.send(
      Workspace({
        pageTitle,
        pageNote,
        navTitle,
        navTitleHref,
        showLogs: res.locals.authn_is_administrator || res.locals.authn_is_instructor,
        heartbeatIntervalSec: config.workspaceHeartbeatIntervalSec,
        visibilityTimeoutSec: config.workspaceVisibilityTimeoutSec,
        socketToken: generateSignedToken(
          { workspace_id: res.locals.workspace_id.toString() },
          config.secretKey,
        ),
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const workspace_id = res.locals.workspace_id;

    if (req.body.__action === 'reboot') {
      await workspaceUtils.updateWorkspaceState(workspace_id, 'stopped', 'Rebooting container');
      await sqldb.queryAsync(sql.update_workspace_rebooted_at_now, {
        workspace_id,
      });
      res.redirect(`/pl/workspace/${workspace_id}`);
    } else if (req.body.__action === 'reset') {
      await workspaceUtils.updateWorkspaceState(
        workspace_id,
        'uninitialized',
        'Resetting container',
      );
      await sqldb.queryAsync(sql.increment_workspace_version, { workspace_id });
      res.redirect(`/pl/workspace/${workspace_id}`);
    } else {
      return next(new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`));
    }
  }),
);

export default router;
