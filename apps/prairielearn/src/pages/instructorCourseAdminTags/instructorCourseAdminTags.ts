import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { TagSchema } from '../../lib/db-types.js';
import { FileModifyEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { selectTagsByCourseId } from '../../models/tags.js';

import { InstructorCourseAdminTags } from './instructorCourseAdminTags.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tags = await selectTagsByCourseId(res.locals.course.id);

    const courseInfoExists = await fs.pathExists(
      path.join(res.locals.course.path, 'infoCourse.json'),
    );
    let origHash: string | null = null;
    if (courseInfoExists) {
      origHash = sha256(
        b64EncodeUnicode(
          await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
        ),
      ).toString();
    }

    res.send(InstructorCourseAdminTags({ resLocals: res.locals, tags, origHash }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (res.locals.course.example_course) {
      throw new error.HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'save_tags') {
      if (!(await fs.pathExists(path.join(res.locals.course.path, 'infoCourse.json')))) {
        throw new error.HttpStatusError(400, 'infoCourse.json does not exist');
      }
      const paths = getPaths(undefined, res.locals);

      const courseInfo = JSON.parse(
        await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
      );

      const body = z
        .object({
          orig_hash: z.string(),
          tags: z.string().transform((s) =>
            z
              .array(
                TagSchema.pick({
                  name: true,
                  color: true,
                  description: true,
                  json_comment: true,
                  implicit: true,
                }),
              )
              .parse(JSON.parse(s)),
          ),
        })
        .parse(req.body);

      const origHash = body.orig_hash;
      const resolveTags = body.tags
        .map((tag) => {
          if (tag.implicit) {
            return;
          }
          return {
            name: tag.name,
            color: tag.color,
            description: tag.description || undefined,
            comment: tag.json_comment || undefined,
          };
        })
        .filter(Boolean);

      courseInfo.tags = propertyValueWithDefault(
        courseInfo.tags,
        resolveTags,
        (v) => !v || v.length === 0,
      );

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInfo));

      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: path.join(res.locals.course.path, 'infoCourse.json'),
        editContents: b64EncodeUnicode(formattedJson),
        origHash,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Tag configuration updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
