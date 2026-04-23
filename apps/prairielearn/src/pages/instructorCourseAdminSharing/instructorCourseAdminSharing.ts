import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import type { Course } from '../../lib/db-types.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getCanonicalHost } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { updateCourseSharingName } from '../../models/course.js';
import { deleteSharingSet, selectSharingSetUsage } from '../../models/sharing-set.js';

import {
  InstructorCourseAdminSharing,
  SharingSetRowSchema,
} from './instructorCourseAdminSharing.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function selectCanChooseSharingName(course: Course) {
  return (
    course.sharing_name === null ||
    !(await sqldb.queryOptionalScalar(
      sql.select_shared_question_exists,
      { course_id: course.id },
      z.boolean().nullable(),
    ))
  );
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_own'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course'>(async (req, res) => {
    if (!res.locals.question_sharing_enabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const sharingSets = await sqldb.queryRows(
      sql.select_sharing_sets,
      { course_id: res.locals.course.id },
      SharingSetRowSchema,
    );

    const host = getCanonicalHost(req);
    const publicSharingLink = new URL(`/pl/public/course/${res.locals.course.id}/questions`, host)
      .href;

    const canChooseSharingName = await selectCanChooseSharingName(res.locals.course);

    const infoCoursePath = path.join(res.locals.course.path, 'infoCourse.json');
    const origHash = (await getOriginalHash(infoCoursePath)) ?? '';

    const canEdit =
      res.locals.authz_data.has_course_permission_own && !res.locals.course.example_course;

    res.send(
      InstructorCourseAdminSharing({
        sharingName: res.locals.course.sharing_name,
        sharingToken: res.locals.course.sharing_token,
        sharingSets,
        publicSharingLink,
        canChooseSharingName,
        canEdit,
        origHash,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_own) {
      throw new error.HttpStatusError(403, 'Access denied (must be course owner)');
    }

    if (!res.locals.question_sharing_enabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    if (req.body.__action === 'sharing_token_regenerate') {
      const rowCount = await sqldb.execute(sql.update_sharing_token, {
        course_id: res.locals.course.id,
      });
      if (rowCount > 1) {
        throw new error.HttpStatusError(400, 'Failed to regenerate sharing token.');
      }
    } else if (req.body.__action === 'course_sharing_set_add') {
      const consuming_course_id = await sqldb.queryOptionalScalar(
        sql.course_sharing_set_add,
        {
          sharing_course_id: res.locals.course.id,
          unsafe_sharing_set_id: req.body.unsafe_sharing_set_id,
          unsafe_course_sharing_token: req.body.unsafe_course_sharing_token,
        },
        z.string().nullable(),
      );
      if (consuming_course_id === null) {
        throw new error.HttpStatusError(400, 'Failed to add course to sharing set.');
      }
    } else if (
      req.body.__action === 'sharing_set_create' ||
      req.body.__action === 'sharing_set_update_description' ||
      req.body.__action === 'sharing_set_delete'
    ) {
      if (res.locals.course.example_course) {
        throw new error.HttpStatusError(
          403,
          'Access denied. Cannot make changes to example course.',
        );
      }

      const infoCoursePath = path.join(res.locals.course.path, 'infoCourse.json');
      if (!(await fs.pathExists(infoCoursePath))) {
        throw new error.HttpStatusError(400, 'infoCourse.json does not exist');
      }

      const courseInfo = JSON.parse(await fs.readFile(infoCoursePath, 'utf8'));
      const sharingSets: { name: string; description?: string }[] = Array.isArray(
        courseInfo.sharingSets,
      )
        ? courseInfo.sharingSets
        : [];

      let successMessage: string;

      if (req.body.__action === 'sharing_set_create') {
        const parsed = z
          .object({
            name: z
              .string()
              .trim()
              .min(1, 'Sharing set name is required.')
              .refine((v) => !v.includes('/') && !v.includes('@'), {
                message: 'Sharing set name cannot contain "/" or "@".',
              }),
            description: z.string().trim().optional(),
          })
          .parse({ name: req.body.name, description: req.body.description });

        if (sharingSets.some((s) => s.name === parsed.name)) {
          throw new error.HttpStatusError(
            400,
            `A sharing set named "${parsed.name}" already exists.`,
          );
        }

        sharingSets.push({
          name: parsed.name,
          ...(parsed.description ? { description: parsed.description } : {}),
        });
        successMessage = `Sharing set "${parsed.name}" created.`;
      } else if (req.body.__action === 'sharing_set_update_description') {
        const parsed = z
          .object({
            name: z.string().min(1),
            description: z.string().trim().optional(),
          })
          .parse({ name: req.body.name, description: req.body.description });

        const index = sharingSets.findIndex((s) => s.name === parsed.name);
        if (index === -1) {
          throw new error.HttpStatusError(
            404,
            `Sharing set "${parsed.name}" not found in infoCourse.json.`,
          );
        }
        if (parsed.description) {
          sharingSets[index] = { ...sharingSets[index], description: parsed.description };
        } else {
          const { description: _description, ...rest } = sharingSets[index];
          sharingSets[index] = rest;
        }
        successMessage = `Sharing set "${parsed.name}" updated.`;
      } else {
        // sharing_set_delete
        const parsed = z.object({ name: z.string().min(1) }).parse({ name: req.body.name });

        const usage = await selectSharingSetUsage({
          course_id: res.locals.course.id,
          name: parsed.name,
        });
        if (usage.question_count > 0 || usage.consumer_count > 0) {
          throw new error.HttpStatusError(
            400,
            `Cannot delete sharing set "${parsed.name}" because it contains questions or has been shared with other courses.`,
          );
        }

        const before = sharingSets.length;
        const filtered = sharingSets.filter((s) => s.name !== parsed.name);
        if (filtered.length === before) {
          throw new error.HttpStatusError(
            404,
            `Sharing set "${parsed.name}" not found in infoCourse.json.`,
          );
        }
        sharingSets.splice(0, sharingSets.length, ...filtered);

        await deleteSharingSet({ course_id: res.locals.course.id, name: parsed.name });

        successMessage = `Sharing set "${parsed.name}" deleted.`;
      }

      if (sharingSets.length > 0) {
        courseInfo.sharingSets = sharingSets;
      } else {
        delete courseInfo.sharingSets;
      }

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInfo));

      const paths = getPaths(undefined, res.locals);
      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: infoCoursePath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: req.body.orig_hash,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', successMessage);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'choose_sharing_name') {
      if (
        req.body.course_sharing_name.includes('/') ||
        req.body.course_sharing_name.includes('@') ||
        req.body.course_sharing_name === ''
      ) {
        throw new error.HttpStatusError(
          400,
          'Course Sharing Name must be non-empty and is not allowed to contain "/" or "@".',
        );
      } else {
        const canChooseSharingName = await selectCanChooseSharingName(res.locals.course);
        if (!canChooseSharingName) {
          throw new error.HttpStatusError(
            400,
            'Unable to change sharing name. At least one question has been shared.',
          );
        }

        await updateCourseSharingName({
          course_id: res.locals.course.id,
          sharing_name: req.body.course_sharing_name.trim(),
        });
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
    res.redirect(req.originalUrl);
  }),
);

export default router;
